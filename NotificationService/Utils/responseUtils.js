export const sendSuccessResponse = (
  res,
  statusCode,
  code,
  message,
  data,
  source,
  count
) => {
  return res.status(statusCode).json({
    success: true,
    code,
    message,
    data,
    source,
    count,
  });
};

export const sendErrorResponse = (
  res,
  statusCode,
  code,
  message,
  errorDetails
) => {
  return res.status(statusCode).json({
    success: false,
    code,
    message,
    error: errorDetails,
  });
};
