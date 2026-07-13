export const detectAndStoreCountry = async () => {
  localStorage.removeItem("takeoutfix_selected_country");
  localStorage.removeItem("takeoutfix_country_manually_set");

  const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  let countryCode = "";
  if (!isLocalhost) {
    countryCode = localStorage.getItem("takeoutfix_detected_country") || "";
    if (countryCode) {
      window.dispatchEvent(new CustomEvent("takeoutfix-country-detected", { detail: countryCode }));
      return;
    }
  }

  try {
    const res = await fetch("/cdn-cgi/trace");
    if (res.ok) {
      const text = await res.text();
      const lines = text.split("\n");
      for (const line of lines) {
        const parts = line.split("=");
        if (parts[0] === "loc" && parts[1]) {
          countryCode = parts[1].trim().toUpperCase();
          break;
        }
      }
    }
  } catch (e) {}

  if (!countryCode) {
    try {
      const res = await fetch("https://freeipapi.com/api/json");
      if (res.ok) {
        const data = await res.json();
        countryCode = data.countryCode || "";
      }
    } catch (e) {}
  }

  if (!countryCode) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) {
        const lowerTz = tz.toLowerCase();
        if (lowerTz.includes("kolkata") || lowerTz.includes("calcutta") || lowerTz.includes("india")) countryCode = "IN";
        else if (lowerTz.includes("tokyo") || lowerTz.includes("japan")) countryCode = "JP";
        else if (lowerTz.includes("shanghai") || lowerTz.includes("beijing") || lowerTz.includes("china")) countryCode = "CN";
        else if (lowerTz.includes("london") || lowerTz.includes("paris") || lowerTz.includes("berlin") || lowerTz.includes("rose")) countryCode = "GB";
      }
    } catch (e) {}
  }

  if (!countryCode) {
    try {
      const languages = navigator.languages || [navigator.language];
      for (const lang of languages) {
        const lowerLang = lang.toLowerCase();
        if (lowerLang.endsWith("-in") || lowerLang === "hi" || lowerLang.startsWith("hi-")) {
          countryCode = "IN";
          break;
        }
        if (lowerLang.endsWith("-jp") || lowerLang === "ja") {
          countryCode = "JP";
          break;
        }
        if (lowerLang.endsWith("-cn") || lowerLang === "zh") {
          countryCode = "CN";
          break;
        }
      }
    } catch (e) {}
  }

  if (!countryCode) {
    countryCode = "US";
  }

  countryCode = countryCode.toUpperCase();
  localStorage.setItem("takeoutfix_detected_country", countryCode);
  window.dispatchEvent(new CustomEvent("takeoutfix-country-detected", { detail: countryCode }));
};
