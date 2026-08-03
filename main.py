import os
import sys
import django
from pathlib import Path


def initialize_django() -> None:
    repo_root = Path(__file__).resolve().parent
    django_root = repo_root / "web"

    if str(django_root) not in sys.path:
        sys.path.insert(0, str(django_root))

    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE",
        "web.settings"
    )

    django.setup()


def main():
    initialize_django()

    from scrapeLogic.dataHandler.data import DataHandler as dh
    from scrapeLogic.dataHandler.storage import StorageHandler as st

    url = "https://schedules.wsu.edu/api/Data/GetHomePageDTO/"
    st.insertToDatabase(dh.getCollegeData(url))


if __name__ == "__main__":
    main()