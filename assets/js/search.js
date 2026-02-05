let allData = {};
let searchTerms = [];
let termColors = {}; // store assigned color per term
let base_url = "https://candidates.democracyclub.org.uk/person/"
let idToParty = {}; // dictionary for fast lookup
const totalPartyCounts = {};
let activeTypeFilter = null;
let currentMatches = [];
let textCache = {}; // { file: { subpath: textOnly } }
let dataLoaded = false;
let dataLoading = null;
const partyColors = {
  "Conservative and Unionist Party": "#0087dc",
  "Labour Party": "#e4003b",
  "Liberal Democrats": "#fdbb30",
  "Green Party": "#6ab023",
  "Green Party of England and Wales": "#6ab023",
  "Scottish National Party (SNP)": "#fdf38e",
  "Plaid Cymru - The Party of Wales": "#005b54",
  "Reform UK": "#12b6cf",
  "UK Independence Party (UKIP)": "#70147a",
  "Social Democratic Party (SDP)": "#d6192a",
  "Independent": "#9e9e9e"
};

Papa.parse(CSV_URL, {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    // results.data is an array of objects [{Name: ..., URL: ...}, ...]
    results.data.forEach(row => {
      if (row.person_id && row.party_name) {
        idToParty[row.person_id.toLowerCase()] = row.party_name; // use lowercase for case-insensitive lookup
      }
    });
  }
});

async function fetchWithLimit(files, limit, onProgress) {
  let i = 0;
  const results = new Array(files.length);

  async function worker() {
    while (i < files.length) {
      const idx = i++;
      const file = files[idx];
      try {
        const response = await fetch(file);
        const data = await response.json();
        results[idx] = { file, data };
      } catch (err) {
        console.error("Failed to load", file, err);
      } finally {
        if (onProgress) onProgress(idx + 1, files.length);
      }
    }
  }

  const workers = Array.from({ length: limit }, worker);
  await Promise.all(workers);
  return results.filter(Boolean);
}

async function loadData() {
  const addButton = document.querySelector(".search-container button");
  const loadingIndicator = document.getElementById("loadingIndicator");
  const spinnerFg = document.querySelector(".spinner-fg");

  // Disable Add button and show spinner
  addButton.disabled = true;
  loadingIndicator.style.display = "block";

  const totalFiles = jsonFiles.length;

  const loaded = await fetchWithLimit(jsonFiles, 8, (done, total) => {
    const progress = (done / total) * 125.6; // full dasharray
    spinnerFg.style.strokeDashoffset = 125.6 - progress;
  });

  for (const { file, data } of loaded) {
    for (const key in data) {
      if (data[key] == null) data[key] = "";
    }
    allData[file] = data;

    // Precompute text-only cache for faster searching
    for (const [subpath, html] of Object.entries(data)) {
      if (typeof html !== "string") continue;
      if (!textCache[file]) textCache[file] = {};
      textCache[file][subpath] = getTextOnly(html);
    }

    const [name, id] = getDisplayName(file);
    const party = getPartyForID(id);
    totalPartyCounts[party] = (totalPartyCounts[party] || 0) + 1;
  }

  // Hide spinner and re-enable Add button
  loadingIndicator.style.display = "none";
  addButton.disabled = false;
}


// Generate a visually distinct HSL color based on term
function generateColor(term) {
  const hash = [...term].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360; // 0-359 degrees
  return `hsl(${hue}, 70%, 50%)`;
}

function addSearchTerms() {
  const input = document.getElementById("searchBox");
  const newTerms = input.value
    .split(",")
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && !searchTerms.includes(t));

  if (newTerms.length === 0) {
    // nothing new, so just clear the box and return
    input.value = "";
    return;
  }

  newTerms.forEach(term => {
    searchTerms.push(term);
    termColors[term] = generateColor(term);
  });

  input.value = "";
  renderSearchTerms();
  ensureDataLoaded().then(runSearch);
}

function removeSearchTerm(term) {
  searchTerms = searchTerms.filter(t => t !== term);
  delete termColors[term];
  renderSearchTerms();
  runSearch();
}

function renderSearchTerms() {
  const container = document.getElementById("searchTerms");
  container.innerHTML = "";

  searchTerms.forEach(term => {
    const span = document.createElement("span");
    span.className = "search-term";
    span.textContent = term;
    span.style.backgroundColor = termColors[term];

    const btn = document.createElement("button");
    btn.innerHTML = "×";
    btn.onclick = () => removeSearchTerm(term);

    span.appendChild(btn);
    container.appendChild(span);
  });
}

function highlightText(text) {
  let highlighted = text;
  searchTerms.forEach(term => {
    const regex = new RegExp(`(${escapeRegExp(term)})`, "gi");
    const color = termColors[term].replace('hsl', 'hsla').replace(')', ', 0.3)');
    highlighted = highlighted.replace(
      regex,
      `<span style="background-color: ${color}; font-weight: bold;">$1</span>`
    );
  });
  return highlighted;
}


function escapeRegExp(string) {
  return string.replace(new RegExp("[.*+?^${}()|[\\]\\\\]", "g"), "\\$&");
}

function getDisplayName(filePath) {
  // Extract the filename without extension
  const parts = filePath.split("/");               // ["assets", "json", "blah.json"]
  let name = parts[parts.length - 1];             // "blah.json"
  name = name.replace(/\.json$/i, "");            // "blah"
  
  name_parts = name.split("_")
  
  id_clean = name_parts[0]
  name_clean = name_parts.slice(1).join(" ");
  
  return [name_clean, id_clean];
}

function getPartyForID(id) {
  return idToParty[id.toLowerCase()] || "#";
}

function getPartyColor(party) {
  if (partyColors[party]) return partyColors[party];
  // fallback: stable hash color
  const hash = [...party].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 45%, 70%)`;
}

function getContrastColor(bgColor) {
  if (bgColor.startsWith("hsl")) {
    return "#111";
  }
  const hex = bgColor.replace("#", "");
  if (hex.length !== 6) return "#111";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111" : "#fff";
}

function updateTypePanel(typeMatches) {
  const panel = document.getElementById("typePanel");

  if (searchTerms.length === 0 || Object.keys(typeMatches).length === 0) {
    panel.innerHTML = "";
    return;
  }

  panel.innerHTML = "<h3>Party Breakdown</h3><p style='font-size:0.85em; color:#666; margin-top:0;'>Click a party to filter results</p>";

  for (const [type, count] of Object.entries(typeMatches)) {
    const total = totalPartyCounts[type] || 0;

    const div = document.createElement("div");
    div.className = "type-entry";
    div.textContent = `${type}: ${count} / ${total}`;
    const bg = getPartyColor(type);
    div.style.backgroundColor = bg;
    div.style.color = getContrastColor(bg);
    div.style.borderRadius = "6px";
    div.style.padding = "4px 8px";
    div.style.marginBottom = "6px";

    // Make it clickable
    div.style.cursor = "pointer";
    div.onclick = () => {
      if (activeTypeFilter === type) {
        // clicking again clears the filter
        activeTypeFilter = null;
      } else {
        activeTypeFilter = type;
      }
      runSearch();
    };

    // Highlight the active filter visually
    if (activeTypeFilter === type) {
      div.style.fontWeight = "bold";
      div.style.textDecoration = "underline";
    }

    panel.appendChild(div);
  }
}


function getTextOnly(htmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, "text/html");
  return doc.body.textContent || "";
}

function highlightAndAppend(text, container) {
  container.innerHTML = ""; // clear old content

  let remaining = text;
  const regex = new RegExp(searchTerms.map(escapeRegExp).join("|"), "gi");

  let match;
  let lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    // Append the text before the match
    if (match.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    // Create a safe <span> for the matched word
    const span = document.createElement("span");
    const term = match[0].toLowerCase();
    span.textContent = match[0]; // safe assignment, no HTML parsing
    span.style.backgroundColor = termColors[term].replace("hsl", "hsla").replace(")", ", 0.3)");
    span.style.fontWeight = "bold";
    container.appendChild(span);

    lastIndex = regex.lastIndex;
  }

  // Append any remaining text
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightPlainTextToHtml(text) {
  if (searchTerms.length === 0) {
    return escapeHtml(text);
  }

  const regex = new RegExp(searchTerms.map(escapeRegExp).join("|"), "gi");
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, match.index));
    }

    const term = match[0].toLowerCase();
    const color = termColors[term].replace("hsl", "hsla").replace(")", ", 0.3)");
    result += `<span style="background-color: ${color}; font-weight: bold;">${escapeHtml(match[0])}</span>`;
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  return result;
}

function buildHighlightedHtmlWithLinks(text) {
  const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += highlightPlainTextToHtml(text.slice(lastIndex, match.index));
    }

    const rawUrl = match[0];
    const href = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
    result += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rawUrl)}</a>`;
    lastIndex = urlRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    result += highlightPlainTextToHtml(text.slice(lastIndex));
  }

  return result;
}

function renderHighlightedText(htmlString, container) {
  // Strip dangerous tags first
  let sanitized = htmlString
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[\s\S]*?>[\s\S]*?<\/embed>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/<img[^>]*>/gi, '');

  // Convert to text only — no live elements
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, "text/html");
  const textOnly = doc.body.textContent || "";

  const wrapper = document.createElement("div");
  wrapper.className = "result-text";
  wrapper.innerHTML = buildHighlightedHtmlWithLinks(textOnly);
  container.appendChild(wrapper);
}

function getSearchMode() {
  const select = document.getElementById("searchModeSelect");
  return select ? select.value : "all";
}

function ensureDataLoaded() {
  if (dataLoaded) return Promise.resolve();
  if (!dataLoading) {
    dataLoading = loadData().then(() => {
      dataLoaded = true;
    });
  }
  return dataLoading;
}

function runSearch() {
  if (!dataLoaded) {
    ensureDataLoaded().then(runSearch);
    return;
  }
  const resultsDiv = document.getElementById("results");
  resultsDiv.innerHTML = "";
  
  let found = false;
  let typeMatches = {};
  currentMatches = []

  if (searchTerms.length === 0) {
    updateTypePanel({});
    const exportButton = document.getElementById("exportButton");
    exportButton.disabled = currentMatches.length === 0;
    return;
  }

  const mode = getSearchMode(); // "all" or "any"

  for (const [filename, content] of Object.entries(allData)) {
    let matches = [];
    const [name, id] = getDisplayName(filename);
    const party = idToParty[id] || "Unknown"; 

    for (const [subpath, text] of Object.entries(content)) {
      if (typeof text !== "string") continue;

      const cachedText = textCache[filename]?.[subpath] || "";
      const textLower = cachedText.toLowerCase();
      const containsAll = searchTerms.every(term => textLower.includes(term));
      const containsAny = searchTerms.some(term => textLower.includes(term));
      const isMatch = mode === "all" ? containsAll : containsAny;

      if (isMatch) {
        matches.push({ subpath, text });
        currentMatches.push({
        candidate: name,
        id: id,
        party: party,
        url: base_url + id,
        section: subpath,
        rawText: text
      });
      }
    }

    if (matches.length > 0) {
    
      if (activeTypeFilter && party !== activeTypeFilter) {
      	continue; // skip this file if it's not the chosen type
      	}
      found = true;
      const fileDiv = document.createElement("div");
      
      const person_website = base_url + id
      
      typeMatches[party] = (typeMatches[party] || 0) + 1;
      
      const partyColor = getPartyColor(party);
      const partyText = getContrastColor(partyColor);
      fileDiv.innerHTML = `<h2>📄 <a href="${person_website}" target="_blank">${name}</a> <span class="party-pill" style="background-color:${partyColor};color:${partyText};">(${party})</span></h2>`;
      matches.forEach(match => {
        const section = document.createElement("details");
        const summary = document.createElement("summary");
        
        summary.textContent = match.subpath;
        
        const contentContainer = document.createElement("div");

        renderHighlightedText(match.text, contentContainer);

        section.appendChild(summary);
        section.appendChild(contentContainer);
        fileDiv.appendChild(section);
        
      });
      resultsDiv.appendChild(fileDiv);
    }
  }

  if (!found) {
    resultsDiv.innerHTML = "<p>No matches found.</p>";
  }
  
  updateTypePanel(typeMatches);
  const exportButton = document.getElementById("exportButton");
  exportButton.disabled = currentMatches.length === 0;
}

function exportResults() {
  if (currentMatches.length === 0) {
    alert("No results to export!");
    return;
  }

  const csvRows = [
    ["Candidate", "ID", "Party", "URL", "Section", "Matched Text"]
  ];

  currentMatches.forEach(match => {
    csvRows.push([
      match.candidate,
      match.id,
      match.party,
      match.url,
      match.section,
      match.rawText
    ]);
  });

  // Convert array to CSV string
  const csvContent = csvRows
    .map(row => row.map(v => `"${v.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "search_results.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Lazy-load data on first search
const modeSelect = document.getElementById("searchModeSelect");
if (modeSelect) {
  modeSelect.addEventListener("change", () => {
    if (searchTerms.length > 0) {
      ensureDataLoaded().then(runSearch);
    }
  });
}
