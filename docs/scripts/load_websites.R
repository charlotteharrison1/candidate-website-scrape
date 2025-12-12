# install.packages("jsonlite")
library(jsonlite)

list_candidate_vars <- function(candidates_file = "assets/data/candidates.csv") {
  names(read.csv(candidates_file, nrows = 1))
}

list_elections <- function(candidates_file = "assets/data/candidates.csv") {
  candidates <- read.csv(candidates_file)
  unique(candidates$election_id)
}

load_candidate_websites <- function(candidates_file = "assets/data/candidates.csv",
                                    json_dirs = c("assets/json", "assets/large_json"),
                                    election_filter = NULL,
                                    keep_vars = c("person_id", "person_name", "election_date", 
                                                  "party_name", "party_id", "homepage_url")) {
  
  candidates <- read.csv(candidates_file, stringsAsFactors = FALSE)
  candidates$person_id <- as.numeric(candidates$person_id)
  
  if (!is.null(election_filter)) {
    candidates <- candidates[grepl(election_filter, candidates$election_id), ]
  }
  
  if (!is.null(keep_vars)) {
    keep_vars <- intersect(keep_vars, names(candidates))
    candidates <- candidates[, keep_vars, drop = FALSE]
  }
  
  json_files <- list.files(json_dirs, pattern = "\\.json$", 
                           full.names = TRUE, recursive = FALSE)
  json_files <- json_files[!grepl("failed_logs", json_files)]
  
  scraped_list <- lapply(json_files, function(file) {
    person_id <- as.numeric(sub("_.*", "", basename(file)))
    content <- jsonlite::fromJSON(file, simplifyVector = TRUE)
    
    data.frame(
      person_id = person_id,
      text = paste(content, collapse = "\n\n"),
      stringsAsFactors = FALSE
    )
  })
  
  scraped_content <- do.call(rbind, scraped_list)
  
  merge(scraped_content, candidates, by = "person_id")
}

# Usage

# list_candidate_vars()
# list_elections()

# load_candidate_websites(election_filter = "parl.2024-07-04") |> 
#     dplyr::glimpse()

