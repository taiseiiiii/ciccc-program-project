import { Outlet } from "react-router-dom";
import BottomNavigation from "../components/BottomNavigation";
import SideNavigation from "../components/SideNavigation";

const AppLayout = () => {
  return (
    <div className="h-screen md:flex md:flex-row">
      <header className="md:hidden">This is header</header>
      <SideNavigation className="hidden md:flex"></SideNavigation>
      <main className="flex-1 h-full overflow-y-auto">
        <Outlet></Outlet>
      </main>
      <BottomNavigation className="md:hidden"></BottomNavigation>
    </div>
  );
};

export default AppLayout;
