export const MOCK_SCHEMA = {
  catalogs: [
    { id: 'prod_warehouse', name: 'Production Warehouse' },
    { id: 'staging_db', name: 'Staging Environment' },
    { id: 'analytics_lake', name: 'Analytics Data Lake' }
  ],
  databases: {
    prod_warehouse: [
      { id: 'core_sales', name: 'core_sales' },
      { id: 'inventory_mgmt', name: 'inventory_mgmt' },
      { id: 'customer_360', name: 'customer_360' }
    ],
    staging_db: [
      { id: 'raw_events', name: 'raw_events' },
      { id: 'temp_staging', name: 'temp_staging' }
    ],
    analytics_lake: [
      { id: 'marketing_v2', name: 'marketing_v2' },
      { id: 'finance_reporting', name: 'finance_reporting' }
    ]
  },
  tables: [
    {
      id: 'users',
      name: 'users',
      type: 'DIMENSION',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'name', type: 'varchar', isPK: false, isFK: false },
        { name: 'email', type: 'varchar', isPK: false, isFK: false },
        { name: 'created_at', type: 'timestamp', isPK: false, isFK: false }
      ]
    },
    {
      id: 'products',
      name: 'products',
      type: 'DIMENSION',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'name', type: 'varchar', isPK: false, isFK: false },
        { name: 'category_id', type: 'int', isPK: false, isFK: true, references: 'categories.id' },
        { name: 'price', type: 'decimal', isPK: false, isFK: false }
      ]
    },
    {
      id: 'categories',
      name: 'categories',
      type: 'DIMENSION',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'name', type: 'varchar', isPK: false, isFK: false }
      ]
    },
    {
      id: 'stores',
      name: 'stores',
      type: 'DIMENSION',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'location', type: 'varchar', isPK: false, isFK: false },
        { name: 'manager_id', type: 'int', isPK: false, isFK: true, references: 'employees.id' }
      ]
    },
    {
      id: 'employees',
      name: 'employees',
      type: 'DIMENSION',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'name', type: 'varchar', isPK: false, isFK: false },
        { name: 'role', type: 'varchar', isPK: false, isFK: false }
      ]
    },
    {
      id: 'orders',
      name: 'orders',
      type: 'FACT',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'user_id', type: 'int', isPK: false, isFK: true, references: 'users.id' },
        { name: 'store_id', type: 'int', isPK: false, isFK: true, references: 'stores.id' },
        { name: 'order_date', type: 'date', isPK: false, isFK: false },
        { name: 'total_amount', type: 'decimal', isPK: false, isFK: false }
      ]
    },
    {
      id: 'order_items',
      name: 'order_items',
      type: 'FACT',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'order_id', type: 'int', isPK: false, isFK: true, references: 'orders.id' },
        { name: 'product_id', type: 'int', isPK: false, isFK: true, references: 'products.id' },
        { name: 'quantity', type: 'int', isPK: false, isFK: false },
        { name: 'price', type: 'decimal', isPK: false, isFK: false }
      ]
    },
    {
      id: 'inventory',
      name: 'inventory',
      type: 'FACT',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'product_id', type: 'int', isPK: false, isFK: true, references: 'products.id' },
        { name: 'store_id', type: 'int', isPK: false, isFK: true, references: 'stores.id' },
        { name: 'stock_level', type: 'int', isPK: false, isFK: false }
      ]
    },
    {
      id: 'sales_targets',
      name: 'sales_targets',
      type: 'FACT',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'store_id', type: 'int', isPK: false, isFK: true, references: 'stores.id' },
        { name: 'target_amount', type: 'decimal', isPK: false, isFK: false },
        { name: 'month', type: 'varchar', isPK: false, isFK: false }
      ]
    },
    {
      id: 'customer_reviews',
      name: 'customer_reviews',
      type: 'DIMENSION',
      columns: [
        { name: 'id', type: 'int', isPK: true, isFK: false },
        { name: 'user_id', type: 'int', isPK: false, isFK: true, references: 'users.id' },
        { name: 'product_id', type: 'int', isPK: false, isFK: true, references: 'products.id' },
        { name: 'rating', type: 'int', isPK: false, isFK: false },
        { name: 'comment', type: 'text', isPK: false, isFK: false }
      ]
    }
  ],
  relationships: [
    { from: 'orders.user_id', to: 'users.id', cardinality: 'N:1' },
    { from: 'orders.store_id', to: 'stores.id', cardinality: 'N:1' },
    { from: 'order_items.order_id', to: 'orders.id', cardinality: 'N:1' },
    { from: 'order_items.product_id', to: 'products.id', cardinality: 'N:1' },
    { from: 'products.category_id', to: 'categories.id', cardinality: 'N:1' },
    { from: 'stores.manager_id', to: 'employees.id', cardinality: '1:1' },
    { from: 'inventory.product_id', to: 'products.id', cardinality: 'N:1' },
    { from: 'inventory.store_id', to: 'stores.id', cardinality: 'N:1' },
    { from: 'sales_targets.store_id', to: 'stores.id', cardinality: 'N:1' },
    { from: 'customer_reviews.user_id', to: 'users.id', cardinality: 'N:1' },
    { from: 'customer_reviews.product_id', to: 'products.id', cardinality: 'N:1' }
  ]
};
