export const getFullUrl = (path) => {
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    return path ? `${baseUrl}${path}` : null;
  };