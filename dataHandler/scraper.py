#from classHandler.semester import Semester
#from classHandler.subject import Subject    
from classHandler.clas import Section
#from classHandler.campus import Campus
import time
import json
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
            soup = BeautifulSoup(html, 'html.parser').find("div", class_="schedule-container")  # Get the main container that holds all the data

            semesterSelection = driver.current_window_handle
            
            campus = cls.getCampus(soup)
            """
            After we get the campuses, let the user select what campus they want. Then we get the semesters for a given campus. Then we get the subjects. Then we get the classess in a subject

            """
            campus_name = campus.find("h4", class_="City").text.strip()
            print(f"Campus selected: {campus_name}")

            semester = cls.getSemester(campus)
            print(f"Semester selected: {semester}")

            buttonToClick = driver.find_element(By.CSS_SELECTOR, f"a.nav-main[aria-label='{campus_name + semester.replace(" ", "")}']")
            buttonToClick.click()  # Click on the semester to load the subjects
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "table.wsu-c-table.wsu-c-table--striped.soc-table tbody tr"))  # Wait for the table that contains the subjects to load
            )

            html = driver.page_source
            soup = BeautifulSoup(html, 'html.parser').find("tbody", class_=["wsu-c-table", "wsu-c-table--striped"])  # Get the table that contains the subjects
            
            classSelection = driver.current_window_handle

            subjects = cls.getSubjects(soup) 
            print(f"Subject selected: {subjects[0][1]}") # Just gonna get the first subject for now

            buttonToClick = driver.find_element(By.CSS_SELECTOR, f"a[aria-label='{subjects[0][1]}']")
            buttonToClick.click()

            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "tocsvbutton"))  # Wait for the button that lets us access the csv to load
            )

            html = driver.page_source
            soup = BeautifulSoup(html, 'html.parser').find("a", class_="tocsvbutton")  
            href = soup['href'].replace("tocsv", "") # We do not want the csv, we want the raw html data
            driver.get(href)

            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "json-formatter-container"))  # Wait for the table that contains the classes to load
            )

            html = driver.page_source
            soup = BeautifulSoup(html, 'html.parser').find("pre")
            classes = json.loads(soup.text)["sections"]  # Get the json data that contains the classes
            classes = cls.formatClasses(classes)  # Format the classes into Section objects
            
            with open("Output.txt", "w", encoding="utf-8") as file:
                 for c in classes:
                    file.write(str(c))
                    file.write("\n")

            driver.quit()
            return soup
        except Exception as e:
            print(f"An error occurred in the data fetching process: {e}")
            return None
        
        
    # get the campus that the user wants to select, reducing the htmlData to just info about the campus
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
    def getSemester(cls, campusData: BeautifulSoup) -> str: #Return string because there is no information nested under semesters - it is a link that changes the page
        semestersList = campusData.find("ul", class_="Semesters").find_all("li", class_="nav-item semester")
        semesters = [semester.find("a", class_="nav-main") for semester in semestersList]
        #print(f"Available semesters: {', '.join([sem.text.strip() for sem in semesters])}")

        #inpt = input(f"Available semesters: {', '.join([sem.text.strip() for sem in semesters])}\nPlease select a semester: ")
        inpt = "Spring 2025"
        while inpt not in [sem.text.strip() for sem in semesters]:
            print("Invalid semester selected. Please try again.")
            inpt = input(f"Available semesters: {', '.join([sem.text.strip() for sem in semesters])}\nPlease select a semester: ")

        inpt = next((sem.text.strip() for sem in semesters if sem.text.strip() == inpt), None)
        for semester in semesters:
            if semester.text.strip() == inpt:
                return semester.text.strip()
            
    @classmethod
    def getSubjects(cls, semesterData: BeautifulSoup) -> list:
        subjectsRaw = semesterData.find_all("tr", class_="zebratable")
        subjects = []
        for subject in subjectsRaw:
            subject_name = subject.find("td", class_="zebratablesubject").text.strip()
            subject_title = subject.find("td", class_="zebratabletitle").text.strip()
            subjects.append((subject_name, subject_title, subject))
        return subjects
    
    @classmethod
    def formatClasses(cls, classData: list) -> list:
        reducedClasses = []
        for c in classData:
            code = c["sln"]
            name = c["title"]
            credits = c["credits"]
            section = c["sectionNumber"]
            t = c["dayTime"]
            location = c["location"]
            instructor = c["instructor"]
            seats_taken = c["enrollment"]
            seats_total = c["enrollmentLimit"]

            reducedClasses.append(Section(code, name, credits, section, t, location, instructor, seats_taken, seats_total))
        return reducedClasses


        

        

"""

User can either type or click on dropdowns/selections to locate courses they want to take.
If done through the dropdowns, the user can select the campus, term, subject, and course

"""