import { useCallback } from 'react';

const DEFAULT_LOCATION = { name: "Jalandhar, Punjab", lat: 31.3260, lon: 75.5762 };

export const useWeather = () => {
  const fetchWeather = useCallback(async (locationName) => {
    try {
      let lat = DEFAULT_LOCATION.lat;
      let lon = DEFAULT_LOCATION.lon;
      let displayName = DEFAULT_LOCATION.name;

      if (locationName && locationName.toLowerCase() !== 'default') {
        // Geocoding via Nominatim
        const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`;
        const geoRes = await fetch(geoUrl, {
          headers: { 'User-Agent': 'VEDA-Assistant/1.0' }
        });
        const geoData = await geoRes.json();

        if (geoData && geoData.length > 0) {
          lat = geoData[0].lat;
          lon = geoData[0].lon;
          displayName = geoData[0].display_name.split(',')[0]; // Short name
        } else {
          // Fallback to Jalandhar/India if geocoding fails but location was provided
          lat = DEFAULT_LOCATION.lat;
          lon = DEFAULT_LOCATION.lon;
          displayName = locationName || DEFAULT_LOCATION.name;
        }
      }

      // Weather via Open-Meteo
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      const weatherRes = await fetch(weatherUrl);
      const weatherData = await weatherRes.json();

      if (weatherData.current_weather) {
        const { temperature, windspeed, weathercode } = weatherData.current_weather;
        return {
          location: displayName,
          temp: temperature,
          wind: windspeed,
          condition: getWeatherCondition(weathercode)
        };
      }
      return null;
    } catch (error) {
      console.error("Weather Error:", error);
      return null;
    }
  }, []);

  return { fetchWeather };
};

// Helper to map Open-Meteo codes to readable strings
const getWeatherCondition = (code) => {
  const codes = {
    0: 'Clear sky',
    1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Depositing rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
    95: 'Thunderstorm',
  };
  return codes[code] || 'Cloudy';
};
