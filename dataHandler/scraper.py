from classHandler.campus import Campus
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager   


class Scraper:
    
    _instance = None

    _options = Options()
    #_options.add_argument("--headless")
    _options.add_argument("--disable-gpu")
    _options.add_argument("--window-size=1920,1080")

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Scraper, cls).__new__(cls)
        return cls._instance
    
    def __init__(self) -> None:
        if not hasattr(self, 'initialized'):
            self.initialized = True

    @classmethod
    def fetch_data(cls, url) -> BeautifulSoup: 
        try:
            driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=cls._options)
            driver.get(url)
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "schedule-container")) # Wait for content to load (Content that contains the campuses, which inturn contains everything else)
            )

            html = driver.page_source
            soup = BeautifulSoup(html, 'html.parser')
            soup = soup.find("div", class_="schedule-container")  # Get the main container that holds all the data

            with open("Output.txt", "w", encoding="utf-8") as file:
                file.write(str(soup))
            
            campus = cls.getCampus(soup)
            """
            After we get the campuses, let the user select what campus they want. Then we get the semesters for a given campus. Then we get the subjects. Then we get the classess in a subject

            """
            print(f"Campus selected: {campus.find('h4', class_='City').text.strip()}")

            semester = cls.getSemester(campus)
            print(f"Semester selected: {semester}")

            driver.quit()
            return soup
        except Exception as e:
            print(f"An error occurred in the data fetching process: {e}")
            return None
        
        
    # get the campus that the user wants to select
    @classmethod
    def getCampus(cls, htmlData: BeautifulSoup) -> BeautifulSoup:
        campus_info = htmlData.find_all("div", class_="header_wrapper") # Get all wrappers that contain campus names and semesters
        campuses = []

        for campus in campus_info:
            campus_name = campus.find("h4", class_="City")
            campuses.append(campus_name.text.strip())
        
        #inpt = input(f"Available campuses: {', '.join(campuses)}\nPlease select a campus: ")
        inpt = "pullman" # Remove when ready

        while inpt.lower() not in [c.lower() for c in campuses]:
            print("Invalid campus selected. Please try again.")
            inpt = input(f"Available campuses: {', '.join(campuses)}\nPlease select a campus: ")
        inpt = next((c for c in campuses if c.lower() == inpt.lower()), None)

        for campus in campus_info:
            if campus.find("h4", class_="City").text.strip().lower() == inpt.lower():
                return campus
    
    @classmethod
    def getSemester(cls, campusData: BeautifulSoup) -> str:
        semestersList = campusData.find("ul", class_="Semesters").find_all("li", class_="nav-item semester")
        semesters = [semester.find("a", class_="nav-main") for semester in semestersList]
        #print(f"Available semesters: {', '.join([sem.text.strip() for sem in semesters])}")

        #inpt = input(f"Available semesters: {', '.join([sem.text.strip() for sem in semesters])}\nPlease select a semester: ")
        inpt = "spring 2025"
        while inpt not in [sem.text.strip() for sem in semesters]:
            print("Invalid semester selected. Please try again.")
            inpt = input(f"Available semesters: {', '.join([sem.text.strip() for sem in semesters])}\nPlease select a semester: ")

        inpt = next((sem.text.strip() for sem in semesters if sem.text.strip() == inpt), None)
        for semester in semesters:
            if semester.text.strip() == inpt:
                return semester.text.strip()
        

        

"""

User can either type or click on dropdowns/selections to locate courses they want to take.
If done through the dropdowns, the user can select the campus, term, subject, and course

"""