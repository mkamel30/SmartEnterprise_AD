# SUPER_ADMIN (مدير النظام) — Complete Capabilities

Everything the **SUPER_ADMIN** role can do across the entire Smart Enterprise Suite application, organized by functional area.

---

## 1. User Management
| Action | Route / Page | Details |
|---|---|---|
| List all users (any branch) | `GET /api/users` → **Users.tsx** | Paginated, filterable by branch/role/status. Global role sees all branches. |
| View single user | `GET /api/users/:id` | No branch restriction for SUPER_ADMIN. |
| Create user | `POST /api/users` | Assign any role, any branch, set `canDoMaintenance`, optionally supply password. |
| Update user | `PUT /api/users/:id` | Change name, role, branch, active status, password. |
| Delete user | `DELETE /api/users/:id` | Cannot delete own account. |
| Reset user password | `POST /api/users/:id/reset-password` | Password policy validated server-side. |
| List available roles | `GET /api/users/meta/roles` | Returns full role list with Arabic labels. |

---

## 2. Branch Management
| Action | Route / Page | Details |
|---|---|---|
| List all branches | `GET /api/branches` → **BranchesSettings.tsx** | Paginated, includes user/customer/request counts. |
| View single branch | `GET /api/branches/:id` | Includes recent transfers. |
| Create branch | `POST /api/branches` | Auto-generates branch code (`BR001`, `BR002`, …) if not provided. Set type, maintenance center, parent branch. |
| Update branch | `PUT /api/branches/:id` | Change code, name, address, type, active status, maintenance center, parent. |
| Delete branch | `DELETE /api/branches/:id` | Blocked if branch has users, customers, or transfers. |
| List branches by type | `GET /api/branches/type/:type` | e.g. `MAINTENANCE_CENTER`, `BRANCH`. |
| Maintenance centers with serviced branches | `GET /api/branches/centers/with-branches` | — |
| Also via admin route | `GET/POST/PUT /api/admin/branches` | Same CRUD, requires [requireSuperAdmin](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/middleware/auth.js#138-153). |

---

## 3. Permissions Management
| Action | Route / Page | Details |
|---|---|---|
| View all permissions matrix | `GET /api/permissions` | Returns **page** + **action** permission matrix for all 7 roles. |
| Update single permission | `PUT /api/permissions` | Toggle a specific role/page or role/action. Cannot remove SUPER_ADMIN from critical pages. |
| Bulk update permissions | `POST /api/permissions/bulk` | Transactional update of multiple permissions at once. |
| Reset permissions to defaults | `POST /api/permissions/reset` | Clears all DB overrides; reverts to hard-coded defaults. |
| Check permission | `GET /api/permissions/check?type=&key=` | Frontend validation helper. |

### Pages SUPER_ADMIN Has Access To (Default)
`/` (Dashboard) · `/requests` · `/customers` · `/warehouse` · `/warehouse-machines` · `/warehouse-sims` · `/transfer-orders` · `/receive-orders` · `/receipts` · `/payments` · `/reports` · `/technicians` · `/approvals` · `/branches` · `/settings`

### Actions SUPER_ADMIN Has Permission For (Default)
`CREATE_REQUEST` · `CLOSE_REQUEST` · `DELETE_REQUEST` · `EXCHANGE_MACHINE` · `RETURN_MACHINE` · `SELL_MACHINE` · `ADD_MACHINE` · `DELETE_MACHINE` · `EXCHANGE_SIM` · `ADD_SIM` · `DELETE_SIM` · `CREATE_TRANSFER` · `RECEIVE_TRANSFER` · `REJECT_TRANSFER` · `ADD_CUSTOMER` · `EDIT_CUSTOMER` · `DELETE_CUSTOMER` · `VIEW_PAYMENTS` · `ADD_PAYMENT` · `MANAGE_USERS` · `MANAGE_BRANCHES` · `VIEW_ALL_BRANCHES` · `VIEW_EXECUTIVE_SUMMARY` · `VIEW_BRANCH_RANKINGS` · `VIEW_INVENTORY_VALUATION`

---

## 4. System Settings
| Action | Route / Page | Details |
|---|---|---|
| View system settings | `GET /api/admin/settings` | Maintenance mode, upload size, session timeout, password expiry, backup schedule. |
| Update system settings | `PUT /api/admin/settings` | Change any system setting (SUPER_ADMIN only). |

---

## 5. Audit Logs & System Monitoring
| Action | Route / Page | Details |
|---|---|---|
| View audit logs (paginated) | `GET /api/admin/audit-logs` | Filter by branch, entity type, action, date range. Sort by date/action/entity. |
| View single audit log | `GET /api/admin/audit-logs/:id` | — |
| Delete old audit logs | `DELETE /api/admin/audit-logs/older-than/:days` | Cleanup logs older than 1–365 days. |
| System status & statistics | `GET /api/admin/system/status` | Total users, customers, requests, machines, branches, open requests, last-24h activity, memory usage, uptime. |
| Recent system activity logs | `GET /api/admin/system/logs/recent?hours=` | Last N hours (max 168 = 7 days). |

---

## 6. Database Backups
| Action | Route / Page | Details |
|---|---|---|
| Create manual backup | `POST /api/backup/create` → **AdminBackups.tsx** | Creates database backup file. |
| List all backups | `GET /api/backup/list` | Returns list of backup files. |
| Restore from backup | `POST /api/backup/restore/:filename` | Restores database to selected backup. |
| Delete backup | `DELETE /api/backup/delete/:filename` | Removes backup file. |
| View backup activity logs | `GET /api/backup/logs` | Recent backup-related system logs. |

---

## 7. Settings & Configuration
| Action | Route / Page | Details |
|---|---|---|
| Manage machine parameters | `GET/POST/DELETE /api/machine-parameters` → **Settings.tsx** | Define serial number prefixes → auto-detect model/manufacturer. |
| Edit machine parameter | `PUT /api/machine-parameters/:id` | — |
| Force-update machine models | `POST /api/force-update-models` | Applies machine parameter rules to all existing warehouse, POS, and admin-store machines. |
| Manage client types | `GET/POST/PUT/DELETE /api/settings/client-types` | Define customer classification types. |
| Branches lookup | `GET /api/branches-lookup` | Returns only `type: BRANCH` branches for dropdowns. |

---

## 8. Admin Store / Administrative Affairs Warehouse
| Action | Route / Page | Details |
|---|---|---|
| View item types | `GET /api/admin-store/settings/types` → **AdminStoreSettings.tsx** | List all warehouse item types. |
| Create/update item type | `POST/PUT /api/admin-store/settings/types` | — |
| View full inventory | `GET /api/admin-store/inventory` → **AdminStoreInventory.tsx** | All assets across warehouses. |
| View asset history | `GET /api/admin-store/assets/:id/history` | Movement/change log per asset. |
| Create asset manually | `POST /api/admin-store/assets/manual` | Add single asset. |
| Import assets (bulk) | `POST /api/admin-store/assets/import` | Bulk import array of assets. |
| View cartons | `GET /api/admin-store/cartons` | List cartons (grouped assets). |
| Create carton | `POST /api/admin-store/cartons` | — |
| Transfer asset to branch | `POST /api/admin-store/transfers/asset` | — |
| Transfer carton to branch | `POST /api/admin-store/transfers/carton` | — |
| Bulk transfer | `POST /api/admin-store/transfers/bulk` | Transfer multiple assets/cartons at once. |
| View stock levels | `GET /api/admin-store/stocks` | Per-branch stock overview. |
| Transfer stock | `POST /api/admin-store/transfers/stock` | — |

---

## 9. Executive Dashboard
| Action | Route / Page | Details |
|---|---|---|
| View executive dashboard | `GET /api/executive-dashboard` → **ExecutiveDashboard.tsx** | KPIs: total requests, machines, revenue, SLA metrics, branch rankings, inventory valuation. |
| Branch performance rankings | Part of executive dashboard | Sorted by requests handled, revenue, etc. |
| Production reports | **ProductionReports.tsx** | — |

---

## 10. Maintenance Center & Workflow
| Action | Route / Page | Details |
|---|---|---|
| View maintenance center | → **MaintenanceCenter.tsx** | Machines at center, repair tracking. |
| Create maintenance request | Via `/requests` page | — |
| Approve/reject maintenance cost | `PUT /api/approvals/:id/respond` → **MaintenanceApprovals.tsx** | Approve or reject maintenance cost estimates. |
| View approval details | `GET /api/approvals/request/:requestId` | — |
| Service assignments | `/api/service-assignments` | Assign technicians to requests. |
| Track machines | `/api/track-machines` → **TrackMachines.tsx** | Current location/status of all machines. |
| Machine shipments | **MaintenanceShipments.tsx** | — |

---

## 11. Warehouse & Inventory (Branch Level)
| Action | Route / Page | Details |
|---|---|---|
| View spare parts | `GET /api/spare-parts` → **Warehouse.tsx** | Branch spare parts inventory. |
| View warehouse machines | `GET /api/warehouse-machines` → **MachineWarehouse.tsx** | Machines in branch warehouse. |
| Add/delete machines | CRUD on warehouse machines | — |
| View SIM warehouse | `GET /api/warehouse-sims` → **SimWarehouse.tsx** | SIM cards in branch warehouse. |
| Add/delete SIM cards | CRUD on warehouse SIMs | — |
| Create transfer orders | `POST /api/transfer-orders` → **TransferOrders.tsx** | Transfer inventory between branches. |
| Receive transfer orders | → **ReceiveOrders.tsx** | Accept incoming transfers. |
| Reject transfers | Via transfer order endpoints | — |

---

## 12. Customer Management
| Action | Route / Page | Details |
|---|---|---|
| List customers | `GET /api/customers` → **Customers.tsx** | Paginated, filterable. |
| Add customer | `POST /api/customers` | — |
| Edit customer | `PUT /api/customers/:id` | — |
| Delete customer | `DELETE /api/customers/:id` | — |

---

## 13. Requests / Service Tickets
| Action | Route / Page | Details |
|---|---|---|
| View all requests | → **Requests.tsx** | Across all branches (global view). |
| Create request | `POST /api/requests` | — |
| Close request | Via request endpoints | — |
| Delete request | Via request endpoints | — |
| Exchange machine (on request) | Via machine workflow | Swap customer's machine. |
| Return machine (on request) | Via machine workflow | Return machine to warehouse. |
| Sell machine | Via sales endpoints | — |

---

## 14. Payments & Finance
| Action | Route / Page | Details |
|---|---|---|
| View payments | → **Payments.tsx** | — |
| Add payment | `POST /api/payments` | — |
| View pending payments | → **PendingPayments.tsx** | — |
| View receipts | → **Receipts.tsx** | — |
| Finance dashboard | `/api/finance` | Financial reports and transactions. |
| Monthly closing | → **MonthlyClosing.tsx** | — |

---

## 15. Reports
| Action | Route / Page | Details |
|---|---|---|
| View all reports | → **Reports.tsx** | — |
| Production reports | → **ProductionReports.tsx** | — |
| Executive summary | Part of executive dashboard | — |
| Branch rankings | Part of executive dashboard | — |
| Inventory valuation | Part of executive dashboard | — |
| Spare parts consumption reports | Via reports endpoints | Paid vs. free parts breakdown. |
| Financial transaction log | Via finance endpoints | — |
| Export to Excel | Various report endpoints | — |

---

## 16. AI Assistant
| Action | Route / Page | Details |
|---|---|---|
| Use AI assistant | `/api/ai` | AI-powered analysis and suggestions. |

---

## 17. Notifications
| Action | Route / Page | Details |
|---|---|---|
| View notifications | `/api/notifications` | System notifications. |
| Push notifications | `/api/push` | Push notification management. |

---

## 18. MFA (Multi-Factor Auth)
| Action | Route / Page | Details |
|---|---|---|
| Manage MFA settings | `/api/mfa` | Enable/disable/verify MFA for users. |

---

## Summary: Exclusive SUPER_ADMIN Actions

The following actions are **exclusive to SUPER_ADMIN** (no other role can perform them):

| Exclusive Action | Where |
|---|---|
| Create / Update / Delete users | [users.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/routes/users.js) |
| Reset user passwords | [users.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/routes/users.js) |
| Manage branches (via admin route) | [admin.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/routes/admin.js) |
| View/delete audit logs | [admin.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/routes/admin.js) |
| Update system settings | [admin.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/routes/admin.js) |
| Manage technicians page | [permissions.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/routes/permissions.js) |
| Manage branches page | [permissions.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/routes/permissions.js) |
| Update/reset permissions | [permissions.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/routes/permissions.js) |

> [!NOTE]
> SUPER_ADMIN automatically has **ALL** permissions defined in the [middleware/permissions.js](file:///c:/Users/mkame/OneDrive/Documents/GitHub/Smart-Enterprise-Suite_VS_20260210/backend/middleware/permissions.js) RBAC system (`Object.values(PERMISSIONS)`) — meaning any new permission added to the system is automatically granted to SUPER_ADMIN.
