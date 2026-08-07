
# Crimson Scheduler

A website to help build schedules for WSU students. 



## Projected Features

- Selection of courses across all Washington State University campuses and available semesters. 
- Periodic ~~webscraping~~ database updates (updating class selections)
- Interactable block scheduling
- More ???


## Roadmap

- ~~Build scrapper to get class information~~ The scrapper has been scrapped (lol). Instead I opted to be smart and just read from WSU's API endpoints instead (please don't kill me). This improves the speed of which I am updating information within the Postgres DB. [complete!] 

- Link PostgreSQL or SQLite Database to save data [complete!]

- Implement backend API to call database and retrieve class information [complete!]

- Create frontend that interacts with API to allow users to build schedules [In progress!]


## License

[GPL](https://choosealicense.com/licenses/gpl-3.0)
