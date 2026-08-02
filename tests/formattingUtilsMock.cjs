const formatNumber = (value, format) => {
  const isPercent = format.includes("%");
  const decimals = (format.split(";")[0].split(".")[1] || "").replace(/[^0#]/g, "").length;
  const scaled = isPercent ? value * 100 : value;
  const prefix = format.match(/^[^0#%]*/)?.[0] ?? "";
  const suffix = format.match(/[^0#%]*$/)?.[0] ?? "";
  return `${prefix}${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(scaled)}${isPercent ? "%" : suffix}`;
};

module.exports = {
  valueFormatter: {
    format: (value, format) => formatNumber(value, format)
  }
};
