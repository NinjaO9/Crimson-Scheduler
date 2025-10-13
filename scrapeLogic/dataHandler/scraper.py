from scrapeLogic.classHandler.semester import Semester
from scrapeLogic.classHandler.subject import Subject    
from scrapeLogic.classHandler.clas import Section
from scrapeLogic.classHandler.campus import Campus
import os
import time
import json
import copy
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from webdriver_manager.chrome import ChromeDriverManager   


class Scraper:
    
    _instance = None
    _options = Options()
    _options.add_argument("--headless=new")
    _options.add_argument("--disable-gpu")
    _options.add_argument("--window-size=1920,1080")
    _options.add_experimental_option('excludeSwitches', ['enable-logging'])
    _devnull = os.devnull  # 'NUL' on Windows
    _service = Service(ChromeDriverManager().install(), log_path=_devnull)

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(Scraper, cls).__new__(cls)
        return cls._instance
    
    def __init__(self) -> None:
        if not hasattr(self, 'initialized'):
            self.initialized = True

    @classmethod
    def fetch_data(cls, url) -> list[Campus]: 
        college_info = []
        campus_info = []
        semester_info = []
        try:
            driver = webdriver.Chrome(service=cls._service, options=cls._options)
            action = ActionChains(driver)

            driver.get(url)
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CLASS_NAME, "schedule-container")) # Wait for content to load (Content that contains the campuses, which inturn contains everything else)
            )

            html = driver.page_source
            soup = BeautifulSoup(html, "html.parser").find("div", class_="schedule-container")  # Get the main container that holds all the data
            
            campuses = cls.getCampuses(soup)


            for campus in campuses:
                campus_name = campus.find("h4", class_="City").text.strip()

                #Very bad temp (or perm) solution
                if campus_name == "Global":
                    campus_name = "DDP"
                
                print(f"Campus selected: {campus_name}")
                semesters = cls.getSemesters(campus)


                for semester in semesters:
                    print(f"Semester selected: {semester}")

                    WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, f"a.nav-main[aria-label=\"{campus_name + semester.replace(" ", "")}\"]"))  # Wait for the table that contains the subjects to load
                    )

                    buttonToClick = driver.find_element(By.CSS_SELECTOR, f"a.nav-main[aria-label=\"{campus_name + semester.replace(" ", "")}\"]")
                    try:
                        buttonToClick.click()
                    except Exception as e: #Button not clickable
                        continue
                    WebDriverWait(driver, 10).until(
                        EC.presence_of_element_located((By.CSS_SELECTOR, "table.wsu-c-table.wsu-c-table--striped.soc-table tbody tr"))  # Wait for the table that contains the subjects to load
                    )

                    html = driver.page_source
                    soup = BeautifulSoup(html, "html.parser").find("tbody", class_=["wsu-c-table", "wsu-c-table--striped"])  # Get the table that contains the subjects

                    subjects = cls.getSubjects(soup) 


                    for name, title in subjects:
                        print(f"Subject selected: {name.strip()} - {title.strip()}")

                        WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, f"a[aria-label=\"{title}\"]")) 
                        )

                        buttonToClick = driver.find_element(By.CSS_SELECTOR, f"a[aria-label=\"{title}\"]")

                        WebDriverWait(driver, 10).until(
                            EC.element_to_be_clickable(buttonToClick)
                        )

                        try:
                            action.move_to_element(buttonToClick).click().perform()
                        except Exception as e:
                            print(f"Error getting {name} data")
                            continue

                        WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CLASS_NAME, "tocsvbutton"))  # Wait for the button that lets us access the csv to load
                        )

                        html = driver.page_source
                        soup = BeautifulSoup(html, "html.parser").find("a", class_="tocsvbutton")  
                        href = soup['href'].replace("tocsv", "") # We do not want the csv, we want the raw html data
                        driver.get(href)

                        WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CLASS_NAME, "json-formatter-container"))  # Wait for the table that contains the classes to load
                        )

                        html = driver.page_source
                        soup = BeautifulSoup(html, "html.parser").find("pre")
                        classes = json.loads(soup.text)["sections"]  # Get the json data that contains the classes
                        classes_l = cls.formatClasses(classes)  # Format the classes into Section objects
                        semester_info.append(Subject(name, copy.deepcopy(classes_l)))

                        driver.back()
                        driver.back() # go back to subject selection page
                        WebDriverWait(driver, 10).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, "table.wsu-c-table.wsu-c-table--striped.soc-table tbody tr"))  # Wait for the table that contains the subjects to load
                        )

                        html = driver.page_source
                        soup = BeautifulSoup(html, 'html.parser').find("tbody", class_=["wsu-c-table", "wsu-c-table--striped"])  # Get the table that contains the subjects

                    driver.back()  # Go back to the campus/semester selection page
                    campus_info.append(Semester(semester.strip(), copy.deepcopy(semester_info)))
                    semester_info.clear()
                college_info.append(Campus(campus_name, copy.deepcopy(campus_info)))
                campus_info.clear()

            print("Data fetching complete.")
            time.sleep(10)
            driver.quit()
        except Exception as e:
            print(f"An error occurred in the data fetching process: {e}")
        """
        with open("Output.txt", "w") as file:
            for college in college_info:
                file.write(str(college))
        """
        return college_info
        
        
    # get the campus that the user wants to select, reducing the htmlData to just info about the campus
    @classmethod
    def getCampuses(cls, htmlData: BeautifulSoup) -> list:
        campus_info = htmlData.find_all("div", class_="header_wrapper") # Get all wrappers that contain campus names and semesters
        campuses = []

        for campus in campus_info:
            campus_name = campus.find("h4", class_="City")
            campuses.append(campus_name.text.strip())

        return campus_info
    
    @classmethod
    def getSemesters(cls, campusData: BeautifulSoup) -> list: #Return string because there is no information nested under semesters - it is a link that changes the page
        semestersList = campusData.find("ul", class_="Semesters").find_all("li", class_="nav-item semester")
        semesters = [semester.find("a", class_="nav-main").text.strip() for semester in semestersList]

        return semesters
            
    @classmethod
    def getSubjects(cls, semesterData: BeautifulSoup) -> list:
        subjectsRaw = semesterData.find_all("tr", class_="zebratable")
        subjects = []
        for subject in subjectsRaw:
            subject_name = subject.find("td", class_="zebratablesubject").text
            subject_title = subject.find("td", class_="zebratabletitle").text
            subjects.append((subject_name, subject_title))
        return subjects
    
    @classmethod
    def formatClasses(cls, classData: list) -> list[list[Section]]:
        reducedClasses = []
        sameCourse = []
        prevCNum = -1
        for course in classData:
            code = (course or {}).get("sln", "N/A")
            subject = (course or {}).get("subject", "N/A")
            number = (course or {}).get("courseNumber", "N/A")
            name = (course or {}).get("title", "N/A")
            credits = (course or {}).get("credits", "N/A")
            section = (course or {}).get("sectionNumber", "N/A")
            t = (course or {}).get("dayTime", "N/A")
            location = (course or {}).get("location", "N/A")
            instructor = (course or {}).get("instructor", "N/A")
            seats_taken = (course or {}).get("enrollment", "N/A")
            seats_total = (course or {}).get("enrollmentLimit", "N/A")

            if (number == 131):
                print("")
            if (prevCNum == -1):
                prevCNum = number
                sameCourse.append(Section(code, subject, number, name, credits, section, t, location, instructor, seats_taken, seats_total))
            elif (prevCNum == number): # Grouping the same course numbers together
                sameCourse.append(Section(code, subject, number, name, credits, section, t, location, instructor, seats_taken, seats_total))
            else:
                reducedClasses.append(copy.deepcopy(sameCourse))
                sameCourse.clear()
                sameCourse.append(Section(code, subject, number, name, credits, section, t, location, instructor, seats_taken, seats_total))
                prevCNum = number
        reducedClasses.append(copy.deepcopy(sameCourse))
        return reducedClasses


        

        

"""

User can either type or click on dropdowns/selections to locate courses they want to take.
If done through the dropdowns, the user can select the campus, term, subject, and course

"""