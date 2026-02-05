
# This fork

## Loading times
I have made some internal changes to allow the website to load faster. I have also caused it to load only after the first search item is inputted, which feels better to me personally. 


## Search options
I added a toggle next to the search bar which allows either 'and' or 'or' options in search.


# candidate-website-data

The following repository holds data from candidate websites which was scraped in April, 2025. The candidate list was obtained from https://candidates.democracyclub.org.uk/.

**Disclaimer: this website and repository visualises and contains scraped data which has not been manually checked, so using this website is at your own risk. The html is sandboxed, so should theoretically not be able to make any requests but this is not guaranteed. ChatGPT was used in building this website.**

## Data

The data for each candidate website can be found inder /assets/json (and assets/large_json for larger jsons which are not visualised here on github pages). They contain information about each section of the persons website alongside the raw text that was scraped.

## Github page

There is a simple front end that can be viewed at . You are able to search for terms and see which candidate (from which party) has text containing this term. There is also an export csv button to generate a csv with this data.

## Future work

Website:
Below is a list of possible suggestions:
* New front end not built using jekyll to more easily visualise the data (and more efficiently)
** Including the search term, export csv button, filter by party as well as new functionality.
* Ability to click the actual url where the page was scraped from to see the source.
* Better sandboxing for scraped html and nicer visualisation.
* Faster website loading (currently files are statically saved here in the repository).

Analysis:
* The scraped data is available here in full, which also allows for an analysis of the candidades websites.



