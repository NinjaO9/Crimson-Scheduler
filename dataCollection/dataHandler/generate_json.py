from __future__ import annotations

from pathlib import Path

from dataCollection.dataHandler.json_storage import JsonStorageHandler

DEFAULT_OUTPUT_ROOT = Path("_generated_site/api/v1/courses")

def main() -> None:
    from dataCollection.dataHandler.data import DataHandler

    url = "https://schedules.wsu.edu/api/Data/GetHomePageDTO/"
    collected_data = DataHandler.getCollegeData(url)
    JsonStorageHandler.writeCourseApi(collected_data, output_root=DEFAULT_OUTPUT_ROOT)


if __name__ == "__main__":
    main()
