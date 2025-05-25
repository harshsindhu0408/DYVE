// utils/getGeoLocation.js
import axios from "axios";

export async function getGeoLocation(ip) {
  if (!ip || ip === "::1" || ip === "127.0.0.1") {
    return "Localhost";
  }

  try {
    const response = await axios.get(`https://ipapi.co/${ip}/json/`);
    const { city, region, country_name } = response.data;

    if (!city && !region && !country_name) {
      return "Unknown Location";
    }

    return `${city || ""}, ${region || ""}, ${country_name || ""}`.replace(
      /^,|,$/g,
      ""
    );
  } catch (error) {
    console.error("Geolocation lookup failed:", error.message);
    return "Unknown Location";
  }
}
