from scrapeLogic.dataHandler.scraper import Scraper as s

def main():
    url = "https://schedules.wsu.edu"
    info = s.fetch_data(url)

    # with open("Output.txt", "w", encoding="utf-8") as file:
    #     file.write(str(info))

if (__name__ == "__main__"):
    main()