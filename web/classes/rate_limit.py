import time
from pathlib import Path

import redis
from django.conf import settings
from django.http import HttpResponse, JsonResponse

MAX_TOKENS = getattr(settings, 'RATE_LIMIT_MAX_TOKENS', 60)
REFILL_RATE = getattr(settings, 'RATE_LIMIT_REFILL_RATE', 1.0)
TTL_SECONDS = getattr(settings, 'RATE_LIMIT_TTL_SECONDS', 60 * 60 * 24 * 7)
FAIL_OPEN = getattr(settings, 'RATE_LIMIT_FAIL_OPEN', True)
TRUST_X_FORWARDED_FOR = getattr(settings, 'RATE_LIMIT_TRUST_X_FORWARDED_FOR', False)

_redis_client = None
_rate_limit_script = None
_script_path = Path(__file__).resolve().parent / 'redis_scripts' / 'token_bucket.lua'


def get_redis_client():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def get_rate_limit_script():
    global _rate_limit_script
    if _rate_limit_script is None:
        _rate_limit_script = _script_path.read_text(encoding='utf-8')
    return _rate_limit_script


def get_client_ip(request):
    if TRUST_X_FORWARDED_FOR:
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', None)
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def get_rate_limit_identity(request):
    session_key = getattr(getattr(request, 'session', None), 'session_key', None)
    if session_key:
        return f'session:{session_key}'

    ip_address = get_client_ip(request)
    if ip_address:
        return f'ip:{ip_address}'

    return None


def _rate_limit_key(identity, scope='global'):
    return f'rate_limit:{scope}:{identity}'


def _consume_token(identity, scope='global'):
    if not identity:
        return {
                'allowed': False,
                'remaining': 0.0,
                'retry_after': 1.0,
                'key': None,
            }
    key = _rate_limit_key(identity, scope=scope)
    now = time.time()
    try:
        allowed, remaining, retry_after = get_redis_client().eval(
            get_rate_limit_script(),
            1,
            key,
            now,
            MAX_TOKENS,
            REFILL_RATE,
            TTL_SECONDS,
        )
        return {
            'allowed': bool(int(allowed)),
            'remaining': float(remaining),
            'retry_after': float(retry_after),
            'key': key,
        }
    except redis.RedisError:
        if FAIL_OPEN:
            return {
                'allowed': True,
                'remaining': float(MAX_TOKENS),
                'retry_after': 0.0,
                'key': key,
            }
        return {
            'allowed': False,
            'remaining': 0.0,
            'retry_after': 1.0,
            'key': key,
        }


def check_session_token_limit(sessionid, scope='global'):
    if not sessionid:
        return {
            'allowed': False,
            'remaining': float(MAX_TOKENS),
            'retry_after': 0.0,
            'key': None,
        }
    return _consume_token(f'session:{sessionid}', scope=scope)


def check_anon_token_limit(ip_address, scope='global'):
    if ip_address:
        return _consume_token(f'ip:{ip_address}', scope=scope)    
    return _consume_token(None, scope=scope)


def check_for_token_limit(request=None, sessionid='', scope='global'):
    if request is not None:
        identity = get_rate_limit_identity(request)
        return _consume_token(identity, scope=scope)
    if sessionid:
        return check_session_token_limit(sessionid, scope=scope)
    return check_anon_token_limit(None, scope=scope)


def token_limit_response(result, as_html=False):
    retry_after = max(1, int(round(result.get('retry_after', 1.0))))
    message = f'Rate limit exceeded. Please wait about {retry_after} second(s) before trying again.'
    headers = {
        'X-Rate-Limited': '1',
        'X-Rate-Limit-Message': message,
        'Retry-After': str(retry_after),
    }
    if as_html:
        return HttpResponse(
            f'<div class="empty-search">{message}</div>',
            status=429,
            content_type='text/html',
            headers=headers,
        )
    return JsonResponse(
        {
            'success': False,
            'message': message,
            'retry_after_seconds': retry_after,
        },
        status=429,
        headers=headers,
    )
