export const lineageData = {
  // Simulating mock lineage for some common tables
  "users": {
    sources: ["bronze_raw_users"],
    downstream: ["gold_monthly_active_users", "gold_user_demographics"]
  },
  "sales": {
    sources: ["bronze_stripe_payments", "bronze_pos_transactions"],
    downstream: ["gold_revenue_dashboard", "gold_sales_by_region"]
  },
  "products": {
    sources: ["bronze_inventory_dump"],
    downstream: ["silver_active_products", "gold_product_performance"]
  }
};

export const getLineageForTable = (tableName) => {
  if (!tableName) return { sources: ["external_source"], downstream: [] };
  // Check if we have exact match
  if (lineageData[tableName.toLowerCase()]) {
    return lineageData[tableName.toLowerCase()];
  }
  
  // Generic mock logic for realistic behavior on any table
  return {
    sources: [`raw_${tableName}`],
    downstream: [`dashboard_${tableName}_summary`]
  };
};
