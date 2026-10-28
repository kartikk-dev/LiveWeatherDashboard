
const API = {
  geocoding: "https://geocoding-api.open-meteo.com/v1/search",
  forecast: "https://api.open-meteo.com/v1/forecast",
};

const STORAGE_KEY = "weatherlineLastCity";
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const elements = {
  form: document.getElementById("weatherForm"),
  cityInput: document.getElementById("cityInput"),
  searchButton: document.getElementById("searchButton"),
  status: document.getElementById("statusMessage"),
  currentWeather: document.getElementById("currentWeather"),
  forecastSection: document.getElementById("forecastSection"),
  forecastGrid: document.getElementById("forecastGrid"),
  emptyState: document.getElementById("emptyState"),
};

const weatherConditions = {
  0: { label: "Clear sky", type: "clear" },
  1: { label: "Mainly clear", type: "clear" },
  2: { label: "Partly cloudy", type: "partlyCloudy" },
  3: { label: "Overcast", type: "cloudy" },
  45: { label: "Fog", type: "fog" },
  48: { label: "Depositing rime fog", type: "fog" },
  51: { label: "Light drizzle", type: "drizzle" },
  53: { label: "Moderate drizzle", type: "drizzle" },
  55: { label: "Dense drizzle", type: "drizzle" },
  56: { label: "Light freezing drizzle", type: "drizzle" },
  57: { label: "Dense freezing drizzle", type: "drizzle" },
  61: { label: "Slight rain", type: "rain" },
  63: { label: "Moderate rain", type: "rain" },
  65: { label: "Heavy rain", type: "rain" },
  66: { label: "Light freezing rain", type: "rain" },
  67: { label: "Heavy freezing rain", type: "rain" },
  71: { label: "Slight snowfall", type: "snow" },
  73: { label: "Moderate snowfall", type: "snow" },
  75: { label: "Heavy snowfall", type: "snow" },
  77: { label: "Snow grains", type: "snow" },
  80: { label: "Slight rain showers", type: "rain" },
  81: { label: "Moderate rain showers", type: "rain" },
  82: { label: "Violent rain showers", type: "rain" },
  85: { label: "Slight snow showers", type: "snow" },
  86: { label: "Heavy snow showers", type: "snow" },
  95: { label: "Thunderstorm", type: "thunderstorm" },
  96: { label: "Thunderstorm with slight hail", type: "thunderstorm" },
  99: { label: "Thunderstorm with heavy hail", type: "thunderstorm" },
};

function getWeatherCondition(code) {
  return (
    weatherConditions[code] || {
      label: "Conditions unavailable",
      type: "cloudy",
    }
  );
}

function setStatus(message, state = "") {
  elements.status.textContent = message;
  elements.status.dataset.state = state;
}

function setLoading(isLoading) {
  elements.searchButton.disabled = isLoading;
  elements.cityInput.disabled = isLoading;

  elements.searchButton.textContent = isLoading
    ? "Searching..."
    : "Search weather";
}

function setText(id, value) {
  const element = document.getElementById(id);
  element.textContent = value;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") {
    return "--";
  }

  const number = Number(value);

  return Number.isFinite(number) ? String(Math.round(number)) : "--";
}

function formatDate(dateString, options) {
  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString(undefined, options);
}

async function fetchJson(url, serviceErrorMessage) {
  let response;

  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      "Network problem. Check your connection and try again."
    );
  }

  if (!response.ok) {
    throw new Error(serviceErrorMessage);
  }

  try {
    return await response.json();
  } catch {
    throw new Error(
      "The weather service returned an invalid response. Please try again."
    );
  }
}


async function findCity(name) {
  const parameters = new URLSearchParams({
    name: name,
    count: "10",
    language: "en",
    format: "json",
    countryCode: "IN",
  });

  const url = `${API.geocoding}?${parameters}`;

  const data = await fetchJson(
    url,
    "The city search service is unavailable. Please try again."
  );

  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error(
      "City not found in India. Check the spelling and try again."
    );
  }

  const result = data.results.find(
    (location) => location.country_code === "IN"
  );

  if (!result) {
    throw new Error(
      "No matching location found in India. Try another city name."
    );
  }

  if (
    typeof result.name !== "string" ||
    !Number.isFinite(result.latitude) ||
    !Number.isFinite(result.longitude)
  ) {
    throw new Error(
      "The city search returned incomplete location data."
    );
  }

  return {
    name: result.name,
    country: result.country || "India",
    region: result.admin1 || "",
    latitude: result.latitude,
    longitude: result.longitude,
  };
}


async function getWeather(latitude, longitude) {
  const parameters = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
    ].join(","),
    forecast_days: "5",
    timezone: "auto",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
  });

  const url = `${API.forecast}?${parameters}`;

  const data = await fetchJson(
    url,
    "We found the city, but could not load its forecast. Please try again."
  );

  if (
    !data.current ||
    !data.daily ||
    !Array.isArray(data.daily.time) ||
    !Array.isArray(data.daily.weather_code) ||
    !Array.isArray(data.daily.temperature_2m_max) ||
    !Array.isArray(data.daily.temperature_2m_min) ||
    data.daily.time.length !== 5 ||
    !data.daily.time.every((date) => typeof date === "string")
  ) {
    throw new Error(
      "The weather service returned incomplete forecast data."
    );
  }

  return data;
}

function createSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NAMESPACE, tagName);

  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }

  return element;
}

function addSvgShape(svg, tagName, attributes) {
  const shape = createSvgElement(tagName, attributes);
  svg.appendChild(shape);
  return shape;
}

function addSun(svg, centerX = 32, centerY = 27, radius = 9) {
  const rayStart = radius + 5;
  const rayEnd = radius + 10;

  for (let angle = 0; angle < 360; angle += 45) {
    const radians = (angle * Math.PI) / 180;

    const startX = centerX + Math.cos(radians) * rayStart;
    const startY = centerY + Math.sin(radians) * rayStart;
    const endX = centerX + Math.cos(radians) * rayEnd;
    const endY = centerY + Math.sin(radians) * rayEnd;

    addSvgShape(svg, "line", {
      x1: startX,
      y1: startY,
      x2: endX,
      y2: endY,
      stroke: "currentColor",
      "stroke-width": 2.5,
      "stroke-linecap": "round",
    });
  }

  addSvgShape(svg, "circle", {
    cx: centerX,
    cy: centerY,
    r: radius,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2.5,
  });
}

function addCloud(svg) {
  addSvgShape(svg, "path", {
    d: "M15 45h33a10 10 0 0 0 0-20 15 15 0 0 0-29-3 10 10 0 0 0-4 23Z",
    fill: "#ffffff",
    stroke: "currentColor",
    "stroke-width": 2.5,
    "stroke-linejoin": "round",
  });
}

function addRain(svg, light = false) {
  const positions = light
    ? [24, 40]
    : [20, 29, 39, 48];

  for (const x of positions) {
    addSvgShape(svg, "line", {
      x1: x,
      y1: 49,
      x2: x - 3,
      y2: 56,
      stroke: "currentColor",
      "stroke-width": 2.5,
      "stroke-linecap": "round",
    });
  }
}

function addSnowflake(svg, centerX, centerY) {
  for (let angle = 0; angle < 180; angle += 60) {
    const radians = (angle * Math.PI) / 180;
    const distance = 4;

    addSvgShape(svg, "line", {
      x1: centerX - Math.cos(radians) * distance,
      y1: centerY - Math.sin(radians) * distance,
      x2: centerX + Math.cos(radians) * distance,
      y2: centerY + Math.sin(radians) * distance,
      stroke: "currentColor",
      "stroke-width": 1.8,
      "stroke-linecap": "round",
    });
  }
}

function renderWeatherIcon(container, code) {
  const condition = getWeatherCondition(code);
  const svg = createSvgElement("svg", {
    viewBox: "0 0 64 64",
    fill: "none",
    "aria-hidden": "true",
    focusable: "false",
  });

  if (condition.type === "clear") {
    addSun(svg);
  } else if (condition.type === "partlyCloudy") {
    addSun(svg, 25, 23, 8);
    addCloud(svg);
  } else if (condition.type === "cloudy") {
    addCloud(svg);
  } else if (condition.type === "fog") {
    addCloud(svg);

    for (const y of [49, 56]) {
      addSvgShape(svg, "line", {
        x1: 13,
        y1: y,
        x2: 51,
        y2: y,
        stroke: "currentColor",
        "stroke-width": 2,
        "stroke-linecap": "round",
      });
    }
  } else if (condition.type === "drizzle" || condition.type === "rain") {
    addCloud(svg);
    addRain(svg, condition.type === "drizzle");
  } else if (condition.type === "snow") {
    addCloud(svg);
    addSnowflake(svg, 22, 53);
    addSnowflake(svg, 42, 53);
  } else if (condition.type === "thunderstorm") {
    addCloud(svg);

    addSvgShape(svg, "path", {
      d: "M35 44 27 53h7l-4 8 12-12h-7l3-5",
      fill: "currentColor",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linejoin": "round",
    });
  }

  container.replaceChildren(svg);
}

function renderCurrentWeather(city, weather) {
  const current = weather.current;
  const cityParts = [city.name, city.region, city.country].filter(Boolean);

  setText("currentCityName", cityParts.join(", "));

  setText(
    "currentDate",
    formatDate(current.time.split("T")[0], {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
  );

  setText("currentTemperature", formatNumber(current.temperature_2m));
  setText("feelsLike", formatNumber(current.apparent_temperature));
  setText("humidity", formatNumber(current.relative_humidity_2m));
  setText("windSpeed", formatNumber(current.wind_speed_10m));

  const condition = getWeatherCondition(current.weather_code);

  setText("currentCondition", condition.label);

  renderWeatherIcon(
    document.getElementById("currentWeatherIcon"),
    current.weather_code
  );
}

function createForecastCard(date, code, maximum, minimum) {
  const card = document.createElement("article");
  card.className = "forecast-card";

  const day = document.createElement("p");
  day.className = "forecast-day";
  day.textContent = formatDate(date, { weekday: "short" });

  const dateLabel = document.createElement("p");
  dateLabel.className = "forecast-date";
  dateLabel.textContent = formatDate(date, {
    month: "short",
    day: "numeric",
  });

  const icon = document.createElement("div");
  icon.className = "forecast-icon";
  renderWeatherIcon(icon, code);

  const condition = document.createElement("p");
  condition.className = "forecast-condition";
  condition.textContent = getWeatherCondition(code).label;

  const temperatures = document.createElement("div");
  temperatures.className = "forecast-temperatures";

  const high = document.createElement("span");
  high.className = "forecast-high";
  high.textContent = `${formatNumber(maximum)}°`;

  const low = document.createElement("span");
  low.className = "forecast-low";
  low.textContent = `${formatNumber(minimum)}°`;

  temperatures.append(high, low);
  card.append(day, dateLabel, icon, condition, temperatures);

  return card;
}

function renderForecast(daily) {
  const cards = daily.time.map((date, index) =>
    createForecastCard(
      date,
      daily.weather_code[index],
      daily.temperature_2m_max[index],
      daily.temperature_2m_min[index]
    )
  );

  elements.forecastGrid.replaceChildren(...cards);
}

function saveCity(name) {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Weather search still works if browser storage is unavailable.
  }
}

async function loadWeather(cityName) {
  setLoading(true);
  setStatus("Searching for weather data...", "loading");

  elements.currentWeather.hidden = true;
  elements.forecastSection.hidden = true;
  elements.emptyState.hidden = true;

  try {
    const city = await findCity(cityName);
    const weather = await getWeather(
      city.latitude,
      city.longitude
    );

    renderCurrentWeather(city, weather);
    renderForecast(weather.daily);

    elements.currentWeather.hidden = false;
    elements.forecastSection.hidden = false;
    elements.emptyState.hidden = true;

    saveCity(cityName);

    setStatus(`Weather updated for ${city.name}.`, "success");
  } catch (error) {
    elements.currentWeather.hidden = true;
    elements.forecastSection.hidden = true;
    elements.emptyState.hidden = false;

    setStatus(
      error instanceof Error
        ? error.message
        : "Something went wrong. Please try again.",
      "error"
    );
  } finally {
    setLoading(false);
  }
}

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const cityName = elements.cityInput.value.trim();

  if (!cityName) {
    setStatus("Enter a city name before searching.", "error");
    elements.cityInput.focus();
    return;
  }

  await loadWeather(cityName);
});

function restoreLastCity() {
  let lastCity = "";

  try {
    lastCity = localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return;
  }

  if (lastCity.trim()) {
    elements.cityInput.value = lastCity;
    loadWeather(lastCity);
  }
}

restoreLastCity();
