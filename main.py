from scrape.scraper import Scraper as s

def main():
    url = "https://schedules.wsu.edu"
    info = s.fetch_data(url)

    campus_names = info.find_all("h4", class_="City")

    for campus in campus_names:
        print(campus.text)

    with open("Output.txt", "w", encoding="utf-8") as file:
        file.write(str(info))

if (__name__ == "__main__"):
    main()