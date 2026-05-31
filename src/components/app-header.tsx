import { Link, useRouter } from "@tanstack/react-router";
import { Bell, ShoppingBag, User, LogOut, ChefHat, Bike, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppHeader() {
  const { profile, signOut, user } = useAuth();
  const cart = useCart();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="grid h-9 w-9 place-items-center rounded-lg gradient-hero text-primary-foreground shadow-sm">
            <ChefHat className="h-5 w-5" />
          </span>
          <span>Kisii Eats</span>
        </Link>

        <nav className="flex items-center gap-2">
          {profile?.role === "customer" && cart.count > 0 && (
            <Link to="/checkout">
              <Button variant="secondary" size="sm" className="gap-2">
                <ShoppingBag className="h-4 w-4" />
                <span>{cart.count}</span>
              </Button>
            </Link>
          )}

          {profile?.role === "restaurant_admin" && (
            <Link to="/restaurant"><Button variant="ghost" size="sm" className="gap-2"><ChefHat className="h-4 w-4" />Restaurant</Button></Link>
          )}
          {profile?.role === "rider" && (
            <Link to="/rider"><Button variant="ghost" size="sm" className="gap-2"><Bike className="h-4 w-4" />Rider</Button></Link>
          )}
          {profile?.role === "admin" && (
            <Link to="/admin"><Button variant="ghost" size="sm" className="gap-2"><Shield className="h-4 w-4" />Admin</Button></Link>
          )}

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon"><User className="h-5 w-5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{profile?.full_name || "Account"}</div>
                  <div className="text-xs text-muted-foreground">{profile?.email}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.navigate({ to: "/profile" })}>Profile</DropdownMenuItem>
                {profile?.role === "customer" && (
                  <DropdownMenuItem onClick={() => router.navigate({ to: "/orders" })}>My orders</DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => router.navigate({ to: "/notifications" })}>
                  <Bell className="mr-2 h-4 w-4" />Notifications
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await signOut(); router.navigate({ to: "/" }); }}>
                  <LogOut className="mr-2 h-4 w-4" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link to="/auth">
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">Sign in</Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
