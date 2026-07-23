import { Outlet } from "react-router-dom";
import Header from "../components/Header";
import BottomNavigation from "../components/BottomNavigation";
import SideNavigation from "../components/SideNavigation";

const AppLayout = () => {
  return (
    <div className="h-screen md:flex md:flex-row">
      <Header className="md:hidden"></Header>
      <SideNavigation className="hidden md:flex"></SideNavigation>
      <main className="flex-1 pt-16 md:pt-0 h-full overflow-y-auto">
        <Outlet></Outlet>
      </main>
      <BottomNavigation className="md:hidden"></BottomNavigation>
    </div>
  );
};

export default AppLayout;
