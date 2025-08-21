import requests
import time
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager   

class Scraper:
    
    _instance = None

    _options = Options()
    _options.add_argument("--headless=new")
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
            driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()), options=cls._options)
            driver.get(url)
            time.sleep(5) 
            html = driver.page_source
            soup = BeautifulSoup(html, 'html.parser')
            return soup
        
        except requests.RequestException as e:
            print(f"Error fetching data from {url}: {e}")
            return None