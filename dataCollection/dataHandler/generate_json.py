from __future__ import annotations

import argparse

from dataCollection.dataHandler.json_storage import JsonStorageHandler

def main() -> None:
    from dataCollection.dataHandler.data import DataHandler

    url = "https://schedules.wsu.edu/api/Data/GetHomePageDTO/"
    collected_data = DataHandler.getCollegeData(url)
    JsonStorageHandler.writeCourseApi(collected_data)


if __name__ == "__main__":
    main()
