import { Outlet } from "react-router-dom";
import Header from "../components/Header";
import BottomNavigation from "../components/BottomNavigation";
import SideNavigation from "../components/SideNavigation";

const AppLayout = () => {
  return (
    <div className="h-screen md:flex md:flex-row">
      <Header></Header>
      <SideNavigation className="hidden md:flex"></SideNavigation>
      <main className="flex-1 h-full overflow-y-auto pt-20 px-4 md:px-6 pb-20 md:pb-6">
        <Outlet></Outlet>
      </main>
      <BottomNavigation className="md:hidden"></BottomNavigation>
    </div>
  );
};

export default AppLayout;
