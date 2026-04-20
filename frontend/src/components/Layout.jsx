import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import TopBar from "./TopBar";

export default function Layout({ title = "", children }) {
  return (
    <div className="min-h-screen flex bg-df-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={title} />
        <main className="flex-1 pb-20 lg:pb-8 px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6" data-testid="main-content">
          {children || <Outlet />}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
