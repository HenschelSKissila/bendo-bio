import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { CartProvider } from './lib/cart'
import { NotificationsProvider } from './lib/notifications'
import Notifications from './pages/shop/Notifications'
import LotInfo from './pages/shop/LotInfo'
import Messages from './pages/shop/Messages'
import { Spinner } from './components/ui'
import ShopLayout from './pages/shop/ShopLayout'
import Home from './pages/shop/Home'
import Catalog from './pages/shop/Catalog'
import ProductPage from './pages/shop/ProductPage'
import Cart from './pages/shop/Cart'
import Checkout from './pages/shop/Checkout'
import OrderDone from './pages/shop/OrderDone'
import Track from './pages/shop/Track'
import Login from './pages/shop/Login'
import Account from './pages/shop/Account'
import Legal from './pages/shop/Legal'
import Setup from './pages/Setup'
const Courier = lazy(() => import('./pages/Courier'))

// Espace gestion chargé à la demande (boutique plus légère pour les clients)
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const Today = lazy(() => import('./pages/admin/Today'))
const Orders = lazy(() => import('./pages/admin/Orders'))
const OrderDetail = lazy(() => import('./pages/admin/OrderDetail'))
const Products = lazy(() => import('./pages/admin/Products'))
const Stock = lazy(() => import('./pages/admin/Stock'))
const Scanner = lazy(() => import('./pages/admin/Scanner'))
const Slots = lazy(() => import('./pages/admin/Slots'))
const Zones = lazy(() => import('./pages/admin/Zones'))
const Alerts = lazy(() => import('./pages/admin/Alerts'))
const Customers = lazy(() => import('./pages/admin/Customers'))
const Reports = lazy(() => import('./pages/admin/Reports'))
const Users = lazy(() => import('./pages/admin/Users'))
const Audit = lazy(() => import('./pages/admin/Audit'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const Messaging = lazy(() => import('./pages/admin/Messaging'))

export default function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
      <CartProvider>
        <BrowserRouter>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route element={<ShopLayout />}>
                <Route index element={<Home />} />
                <Route path="catalogue" element={<Catalog />} />
                <Route path="produit/:id" element={<ProductPage />} />
                <Route path="panier" element={<Cart />} />
                <Route path="commande" element={<Checkout />} />
                <Route path="commande/merci" element={<OrderDone />} />
                <Route path="suivi" element={<Track />} />
                <Route path="connexion" element={<Login />} />
                <Route path="compte" element={<Account />} />
                <Route path="notifications" element={<Notifications />} />
                <Route path="l/:id" element={<LotInfo />} />
                <Route path="messages" element={<Messages />} />
                <Route path="legal/:doc" element={<Legal />} />
                <Route path="installation" element={<Setup />} />
              </Route>
              <Route path="livreur" element={<Courier />} />
              <Route path="admin" element={<AdminLayout />}>
                <Route index element={<Today />} />
                <Route path="commandes" element={<Orders />} />
                <Route path="commandes/:id" element={<OrderDetail />} />
                <Route path="produits" element={<Products />} />
                <Route path="stock" element={<Stock />} />
                <Route path="scanner" element={<Scanner />} />
                <Route path="creneaux" element={<Slots />} />
                <Route path="zones" element={<Zones />} />
                <Route path="alertes" element={<Alerts />} />
                <Route path="clients" element={<Customers />} />
                <Route path="rapports" element={<Reports />} />
                <Route path="utilisateurs" element={<Users />} />
                <Route path="journal" element={<Audit />} />
                <Route path="parametres" element={<Settings />} />
                <Route path="messagerie" element={<Messaging />} />
              </Route>
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </CartProvider>
      </NotificationsProvider>
    </AuthProvider>
  )
}
