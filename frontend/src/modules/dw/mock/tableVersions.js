export const tableVersions = {
  "users": [
    { version: 1, action: "Injected from PostgreSQL", timestamp: new Date(Date.now() - 86400000 * 5).toISOString(), user: "admin@arithwise.com" },
    { version: 2, action: "Tagged: Silver", timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), user: "data_eng@arithwise.com" },
    { version: 3, action: "Manual Data Refresh", timestamp: new Date(Date.now() - 86400000 * 1).toISOString(), user: "system" }
  ],
  "sales": [
    { version: 1, action: "Injected from PostgreSQL", timestamp: new Date(Date.now() - 86400000 * 10).toISOString(), user: "admin@arithwise.com" },
    { version: 2, action: "Tagged: Bronze", timestamp: new Date(Date.now() - 86400000 * 9).toISOString(), user: "data_eng@arithwise.com" },
    { version: 3, action: "Tagged: Gold", timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), user: "data_steward@arithwise.com" }
  ]
};

export const getVersionsForTable = (tableName) => {
  if (!tableName) return [];
  
  if (tableVersions[tableName.toLowerCase()]) {
    return tableVersions[tableName.toLowerCase()];
  }
  
  // Create generic deterministic versions based on table name length
  return [
    { version: 1, action: "Injected from Catalog", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), user: "admin@arithwise.com" },
    { version: 2, action: "Schema Validation Passed", timestamp: new Date(Date.now() - 86400000 * 1.9).toISOString(), user: "system" },
    { version: 3, action: "Manual Data Refresh", timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), user: "admin@arithwise.com" }
  ].reverse(); // newest first makes more sense for a timeline usually, or oldest first. Let's return oldest first and reverse in UI.
};
