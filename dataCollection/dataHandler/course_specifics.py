"""Discover and fetch WSU course-specific information.

The schedule API does not provide the detail endpoint URLs.  They are derived
from each offering using WSU's ``GetSectionInfo`` route, then fetched and
stored in a stable JSON document per course.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

DEFAULT_CATALOG_URL = 'https://ninjao9.github.io/Crimson-Scheduler/api/v1/catalog.json'
DEFAULT_OUTPUT_ROOT = Path('_generated_site/api/v1/specifics')
SECTION_INFO_BASE = 'https://schedules.wsu.edu/api/Data/GetSectionInfo'
TIMEOUT_SECONDS = 30


def slugify(value: str) -> str:
    value = re.sub(r'[^a-z0-9]+', '-', str(value or '').strip().lower())
    return value.strip('-')


def course_key(subject: str, number: object) -> str:
    return f'{slugify(subject)}-{slugify(number)}'


def build_session() -> requests.Session:
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({'GET'}),
        respect_retry_after_header=True,
    )
    session = requests.Session()
    session.mount('https://', HTTPAdapter(max_retries=retry))
    session.mount('http://', HTTPAdapter(max_retries=retry))
    session.headers.update({'User-Agent': 'Crimson-Scheduler-course-specifics/1.0'})
    return session


def load_json(session: requests.Session, url: str) -> dict:
    response = session.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, dict):
        raise ValueError(f'Expected a JSON object from {url}')
    return payload


def split_term(term: str) -> tuple[str, str]:
    match = re.fullmatch(r'\s*([A-Za-z]+)\s+(\d{4})\s*', str(term or ''))
    if match is None:
        raise ValueError(f'Catalog term is not in "Season YYYY" form: {term!r}')
    return match.group(1).title(), match.group(2)


"""
WSU API:
https://schedules.wsu.edu/api/Data/GetSectionInfo/Pullman/Fall/2026/Cpt%20S/121/1/false/true

https://schedules.wsu.edu/api/Data/GetSectionInfo/<Campus>/<Term>/<Year>/<Subject>/<coursecode>/<section>/<islab>/true

Constructing GetSectionInfo URL from available data
"""


def section_info_url(
    campus: str,
    term: str,
    prefix: str,
    course_number: object,
    section_number: object,
    is_lab: bool,
) -> str:
    season, year = split_term(term)
    parts = [
        campus,
        season,
        year,
        prefix,
        str(course_number),
        str(section_number),
        str(bool(is_lab)).lower(),
        'true',  # Not entirely sure what this final boolean is doing in the URL? From testing its just.... there
    ]
    return f'{SECTION_INFO_BASE}/' + '/'.join(quote(part.strip(), safe='') for part in parts)


def discover_courses(session: requests.Session, catalog_url: str) -> dict[str, dict]:
    catalog = load_json(session, catalog_url)
    discovered: dict[str, dict] = {}
    for campus in catalog.get('campuses', []):
        for term in campus.get('terms', []):
            relative_url = term.get('url')
            if not relative_url:
                continue
            term_url = urljoin(catalog_url, relative_url)
            payload = load_json(session, term_url)
            for subject in payload.get('subjects', []):
                for course in subject.get('courses', []):
                    subject_name = course.get('subject') or subject.get('subject')
                    number = course.get('courseNumber')
                    if not subject_name or number is None:
                        continue
                    key = course_key(subject_name, number)
                    prefix = course.get('subjectPrefix') or subject_name
                    item = discovered.setdefault(
                        key,
                        {
                            'course': key,
                            'subject': str(subject_name).strip(),
                            'courseNumber': number,
                            'courseName': course.get('courseName') or course.get('course', ''),
                            'specificUrls': set(),
                            'offerings': [],
                        },
                    )
                    for section in course.get('sections', []):
                        section_number = section.get('sectionNumber')
                        if section_number is None:
                            continue
                        item['specificUrls'].add(
                            section_info_url(
                                campus.get('campus', ''),
                                term.get('term', ''),
                                prefix,
                                number,
                                section_number,
                                section.get('isLab', False),
                            )
                        )
                    item['offerings'].append(
                        {'campus': campus.get('campus'), 'term': term.get('term')}
                    )
    return discovered


def _find_field(payload: object, names: set[str]) -> object:
    """Find a named field in a response, including a shallow wrapper object."""
    if not isinstance(payload, dict):
        return None
    for name in names:
        if name in payload:
            return payload[name]
    for value in payload.values():
        if isinstance(value, dict):
            found = _find_field(value, names)
            if found is not None:
                return found
    return None


def extract_course_fields(payload: object) -> dict:
    """Keep only the course metadata consumed by the application."""
    instructors = _find_field(payload, {'instructors'})
    if not isinstance(instructors, list):
        instructors = []

    return {
        'courseDescription': _find_field(payload, {'courseDescription'}) or '',
        'coursePrerequisites': (_find_field(payload, {'coursePrerequisite'}) or ''),
        'instructors': instructors,
    }


def parse_course_response(response: requests.Response) -> dict:
    try:
        return extract_course_fields(response.json())
    except ValueError:
        return {
            'courseDescription': '',
            'coursePrerequisites': '',
            'instructors': [],
        }


def fetch_course_specifics(session: requests.Session, item: dict) -> dict:
    urls = sorted(item['specificUrls'])
    sources = []
    errors = []
    for url in urls:
        try:
            response = session.get(url, timeout=TIMEOUT_SECONDS)
            response.raise_for_status()
            sources.append({'url': url, 'response': parse_course_response(response)})
        except requests.RequestException as exc:
            errors.append({'url': url, 'error': str(exc)})
    return {
        'version': 1,
        'generatedAt': datetime.now(UTC).isoformat(),
        'course': item['course'],
        'subject': item['subject'],
        'courseNumber': item['courseNumber'],
        'courseName': item['courseName'],
        'offerings': item['offerings'],
        'sources': sources,
        'errors': errors,
        'available': bool(sources),
    }


def write_specifics(
    discovered: dict[str, dict], session: requests.Session, output_root: Path
) -> None:
    output_root.mkdir(parents=True, exist_ok=True)
    manifest = {
        'version': 1,
        'generatedAt': datetime.now(UTC).isoformat(),
        'courses': [],
    }
    for key in sorted(discovered):
        item = discovered[key]
        item['specificUrls'] = set(item['specificUrls'])
        payload = fetch_course_specifics(session, item)
        path = output_root / f'{key}.json'
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        manifest['courses'].append(
            {'course': key, 'url': f'{key}.json', 'available': payload['available']}
        )
        print(f'Wrote {path}', flush=True)
    (output_root / 'index.json').write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8'
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog-url', default=DEFAULT_CATALOG_URL)
    parser.add_argument('--catalog-file', type=Path)
    parser.add_argument('--output-root', type=Path, default=DEFAULT_OUTPUT_ROOT)
    args = parser.parse_args()

    session = build_session()
    if args.catalog_file:
        catalog_url = args.catalog_file.resolve().as_uri()
    else:
        catalog_url = args.catalog_url
    discovered = discover_courses(session, catalog_url)
    if not discovered:
        raise RuntimeError('No courses were discovered from the catalog; refusing to publish.')
    print(f'Discovered {len(discovered)} unique courses.', flush=True)
    write_specifics(discovered, session, args.output_root)


if __name__ == '__main__':
    main()
