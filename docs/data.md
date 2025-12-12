# Background and data collection

This dataset contains website content from UK political candidates scraped from their campaign websites. 

## Sampling frame

We obtain our sampling frame of homepage URLs from Democracy Club's crowd - sourced data on political candidates using their [public API endpoint](https://candidates.democracyclub.org.uk/data/export_csv/).

The dataset is filtered to include only candidates from elections held after January 1st, 2024. Each record from Democracy Club includes a unique person id, information about the candidate and election they are running in. These IDs can be used to merge in further information from Democracy Club.

For more information on the Democracy Club data please see [their documentation](https://candidates.democracyclub.org.uk/). Democracy Club Candidates is a crowdsourced dataset on which many tools and further data collection efforts rely on. If you find this data useful, please consider helping collect more candidate information by [inputting data for Democracy Club](https://candidates.democracyclub.org.uk/volunteer/).

## Scraping 

The scraper starts at each candidate's homepage and systematically follows all internal links within their domain. URLs are standardized to prevent duplicate scraping of the same page. The system excludes search pages and respects a manually curated exclusion list (`exclude_urls.txt`) for problematic or irrelevant domains  -  such as shared party infrastructure that doesn't contain candidate - specific content, or sites known to block automated access.

## Data cleaning 


The scraper saves the raw HTML file of each page on the website. We have cleaned this data by extracting the text from each page, and creating a single JSON file for each website, with each page being an object within these files. JSON files follow the format: [Democracy Club `person_id`, \_, Democracy Club `person_name`] from the sampling frame.

# Data structure

JSON files are stored in `assets/json` and `assets/large_json` ^[`assets/large_json` contains very large websites with many scrapped pages.]. 

The file names contain the Democracy Club's `person_id` so that further data can be linked in.


# Using data

The script `docs/scripts/load_websites.R` contains an example function (`load_candidate_websites()`) that produces a dataframe with Democracy Club's `person_id`, the full text of the website collapsed into a single string.  


Load all candidate websites with default variables:

```{r}
all_candidates <- load_candidate_websites()
```

The function contains some options for which variables to load and filtering elections to include.

## Filtering by election 

Explore available elections:
```{r}
list_elections()
```

Filter to specific elections using regex patterns on the `election_id` field:

```{r}
# 2024 general election
ge_2024 <- load_candidate_websites(election_filter = "parl.2024-07-04")

# All parliamentary elections
parl <- load_candidate_websites(election_filter = "^parl\\.")

# All 2024 elections
all_2024 <- load_candidate_websites(election_filter = "2024")

# Local elections in Brighton
brighton <- load_candidate_websites(election_filter = "brighton")
```

## Selecting variables

See available variables:
```{r}
list_candidate_vars()
```

Keep additional variables:
```{r}
with_results <- load_candidate_websites(
  election_filter = "parl.2024-07-04",
  keep_vars = c("person_id", "person_name", "party_name", 
                "homepage_url", "elected", "post_label")
)
```


