export type Role = 'client' | 'employee' | 'admin' | 'courier'
export type Unit = 'piece' | 'kg' | 'g' | 'l' | 'botte' | 'barquette' | 'sachet' | 'pack' | 'colis'
export type OrderStatus = 'pending_payment' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery'
  | 'delivered' | 'cancelled' | 'refunded' | 'partially_refunded' | 'delivery_failed'
export type Fulfillment = 'delivery' | 'pickup'
export type MovementType = 'reception' | 'sale' | 'return_restock' | 'adjustment' | 'inventory'
  | 'loss' | 'breakage' | 'donation' | 'destruction' | 'correction'

export interface Profile {
  id: string; email: string | null; full_name: string | null; phone: string | null; role: Role; active: boolean
  marketing_consent: boolean; sms_consent: boolean; requested_role?: 'courier' | 'employee' | null; internal_notes: string | null; last_login_at: string | null; created_at: string
}
export interface Category { id: string; name: string; slug: string; icon: string; sort_order: number; expiry_alert_days: number | null; active: boolean }
export interface Product {
  id: string; sku: string; barcode: string | null; name: string; description: string | null; category_id: string | null
  image_url: string | null; unit: Unit; packaging: string | null; price: number; tax_rate: number; variable_weight: boolean
  min_qty: number; qty_step: number; ingredients: string | null; allergens: string | null; conservation: string | null
  origin: string | null; organic: boolean; featured: boolean; status: 'active' | 'hidden' | 'unavailable'
  low_threshold: number; critical_threshold: number; expiry_alert_days: number | null
}
export interface Stock { product_id: string; physical: number; sellable: number; reserved: number; available: number }
export interface Lot {
  id: string; product_id: string; lot_number: string; supplier: string | null; received_at: string; qty_initial: number
  qty_remaining: number; expiry_date: string | null; expiry_kind: 'DLC' | 'DDM' | null; unit_cost: number | null
  status: 'active' | 'blocked' | 'expired' | 'depleted'; notes: string | null; created_at: string
}
export interface Movement { id: number; lot_id: string | null; product_id: string; type: MovementType; quantity: number; reason: string | null; order_id: string | null; user_id: string | null; created_at: string }
export interface Zone { id: string; name: string; postal_codes: string[]; fee: number; min_order: number; free_above: number | null; active: boolean }
export interface Slot { id: string; type: Fulfillment; zone_id: string | null; starts_at: string; ends_at: string; capacity: number; status: 'open' | 'blocked'; note: string | null }
export interface SlotTemplate { id: string; weekday: number; start_time: string; end_time: string; type: Fulfillment; zone_id: string | null; capacity: number; active: boolean }
export interface Order {
  id: string; order_number: string; customer_id: string | null; guest_name: string | null; guest_email: string | null; guest_phone: string | null
  status: OrderStatus; fulfillment: Fulfillment; address_street: string | null; address_city: string | null; address_postal_code: string | null
  address_instructions: string | null; zone_id: string | null; slot_id: string | null; payment_method: 'cash_on_delivery' | 'mobile_money_on_delivery' | 'online'
  payment_status: string; subtotal: number; tax_total: number; delivery_fee: number; discount: number; total: number; currency: string
  customer_note: string | null; internal_note: string | null; reserved_until: string | null; stock_committed: boolean; assigned_to: string | null
  departed_at: string | null; delivered_at: string | null; received_by: string | null; courier_id?: string | null; failure_reason: string | null; cancel_reason: string | null; created_at: string; updated_at: string
}
export interface OrderItem {
  id: string; order_id: string; product_id: string | null; product_name: string; product_sku: string; unit: Unit; unit_price: number
  tax_rate: number; quantity: number; actual_weight: number | null; line_total: number; picked: boolean; unavailable: boolean
}
export interface Alert {
  id: string; type: string; level: 'info' | 'warning' | 'critical'; product_id: string | null; lot_id: string | null; order_id: string | null
  message: string; status: 'open' | 'resolved'; resolution_note: string | null; created_at: string; resolved_at: string | null
}
export interface Settings {
  id: number; shop_name: string; currency: string; timezone: string; reservation_minutes: number; min_prep_hours: number
  same_day_cutoff: string; allow_guest_checkout: boolean; allow_pickup: boolean; pickup_address: string | null
  default_expiry_alert_days: number; contact_email: string | null; contact_phone: string | null
  legal_notice: string | null; privacy_policy: string | null; terms: string | null; delivery_info: string | null
}
