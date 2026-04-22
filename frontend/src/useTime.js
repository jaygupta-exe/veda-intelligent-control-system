import { useCallback } from 'react';

export const useTime = () => {
  const fetchTime = useCallback(async (locationName) => {
    try {
      let displayName = locationName && locationName.toLowerCase() !== 'default' 
        ? locationName.charAt(0).toUpperCase() + locationName.slice(1) 
        : "India";

      // The user's OS timezone offset is misconfigured, but their local clock reads IST.
      // So we just use the raw local clock time without applying ANY timezone conversions.
      const now = new Date();
      const indiaTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      });

      return {
        location: displayName,
        time: indiaTime,
        date: now.toLocaleDateString('en-US')
      };
    } catch (error) {
      console.error("Time Error:", error);
      const now = new Date();
      return {
        location: locationName || "India",
        time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }),
        date: now.toLocaleDateString()
      };
    }
  }, []);

  return { fetchTime };
};


