import { NavLink, useLocation } from 'react-router-dom';

export function Navigation() {
  const location = useLocation();
  const search = location.search;

  return (
    <>
      {/* Top Header - Tender Bloom Style */}
      <header className="fixed top-0 w-full z-50 pt-safe bg-[#fbf9f5]/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.03)] border-b border-[#eae8e4]">
        <div className="max-w-[1080px] mx-auto h-16 px-4 flex items-center justify-between">
          <NavLink to={`/children${search}`} className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-full bg-[#fb7185]/20 flex items-center justify-center text-[#a93349] group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[20px]">child_care</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-[#a93349] tracking-wide uppercase">CareLink 智慧托育</p>
              <h1 className="text-base font-bold text-[#1b1c1a] tracking-tight leading-tight">透明記錄平台</h1>
            </div>
          </NavLink>

          <NavLink to="/invitations">照護邀請</NavLink>
          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1.5">
            <NavLink
              to={`/children${search}`}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#a93349] text-[#ffffff] shadow-sm'
                    : 'text-[#574143] hover:bg-[#eae8e4]'
                }`
              }
            >
              寶寶列表
            </NavLink>
            <NavLink
              to={`/timeline${search}`}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#a93349] text-[#ffffff] shadow-sm'
                    : 'text-[#574143] hover:bg-[#eae8e4]'
                }`
              }
            >
              今日紀錄
            </NavLink>
            <NavLink
              to={`/entry${search}`}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#a93349] text-[#ffffff] shadow-sm'
                    : 'text-[#574143] hover:bg-[#eae8e4]'
                }`
              }
            >
              快速記一筆
            </NavLink>
            <NavLink
              to={`/calendar${search}`}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#a93349] text-[#ffffff] shadow-sm'
                    : 'text-[#574143] hover:bg-[#eae8e4]'
                }`
              }
            >
              照護日曆
            </NavLink>
            <NavLink
              to={`/reports${search}`}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#a93349] text-[#ffffff] shadow-sm'
                    : 'text-[#574143] hover:bg-[#eae8e4]'
                }`
              }
            >
              月度報表
            </NavLink>
            <NavLink
              to={`/contract${search}`}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#a93349] text-[#ffffff] shadow-sm'
                    : 'text-[#574143] hover:bg-[#eae8e4]'
                }`
              }
            >
              托育契約
            </NavLink>
            <NavLink
              to={`/billing${search}`}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-[#a93349] text-[#ffffff] shadow-sm'
                    : 'text-[#574143] hover:bg-[#eae8e4]'
                }`
              }
            >
              費用帳務
            </NavLink>
          </div>

          <div className="flex items-center gap-2">
            <NavLink
              to="/dev"
              className="w-8 h-8 rounded-full bg-[#a93349] flex items-center justify-center shadow-sm text-white hover:opacity-90 transition-opacity"
              title="個人與測試設定"
            >
              <span className="material-symbols-outlined text-[18px]">person</span>
            </NavLink>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar - Tender Bloom Floating Style */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 pb-safe bg-[#ffffff]/95 backdrop-blur-xl shadow-[0_-2px_16px_rgba(251,113,133,0.08)] border-t border-[#eae8e4]">
        <div className="max-w-[760px] mx-auto h-16 px-2 flex items-center justify-around">
          <NavLink
            to={`/children${search}`}
            className={({ isActive }) =>
              `min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-[#a93349] font-bold' : 'text-[#574143] hover:text-[#a93349]'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
            <span className="text-[10px]">寶寶</span>
          </NavLink>

          <NavLink
            to={`/timeline${search}`}
            className={({ isActive }) =>
              `min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-[#a93349] font-bold' : 'text-[#574143] hover:text-[#a93349]'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">menu_book</span>
            <span className="text-[10px]">日誌</span>
          </NavLink>

          <NavLink
            to={`/contract${search}`}
            className={({ isActive }) =>
              `min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-[#a93349] font-bold' : 'text-[#574143] hover:text-[#a93349]'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">description</span>
            <span className="text-[10px]">契約</span>
          </NavLink>

          <NavLink
            to={`/billing${search}`}
            className={({ isActive }) =>
              `min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-[#a93349] font-bold' : 'text-[#574143] hover:text-[#a93349]'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">payments</span>
            <span className="text-[10px]">費用</span>
          </NavLink>

          <NavLink
            to={`/reports${search}`}
            className={({ isActive }) =>
              `min-w-[48px] min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-[#a93349] font-bold' : 'text-[#574143] hover:text-[#a93349]'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">monitoring</span>
            <span className="text-[10px]">報表</span>
          </NavLink>
        </div>
      </nav>
    </>
  );
}
