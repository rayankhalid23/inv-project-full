import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  UserPlus, Search, Pencil, Trash2, 
  MoreVertical, Briefcase, CheckCircle2, 
  Users, UserX, RotateCcw, ShieldCheck, UserCog, UserCircle,
  Loader2, Eye, X, Activity, Scan, AlertTriangle, Clock 
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import axios from 'axios';
import { cn } from '../lib/utils';
import { deleteEmployeeApi,restoreEmployeeApi,updateEmployeeApi } from '../api/userApi';
import EmployeeDetailsModal from './EmployeeDetailsModal';
import AddEmployeeModal from './AddEmployeeModal';


const API_BASE_URL = "http://localhost:8000";


const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
  };

const Employees = () => {
  const [employees, setEmployees] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); 
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const limit = 10;
  const [isEditModalOpen, setIsEditModalOpen] = useState(false); // للتحكم في فتح مودال التعديل
  const [employeeToEdit, setEmployeeToEdit] = useState(null);

  const [selectedEmployeeStats, setSelectedEmployeeStats] = useState(null);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const observer = useRef();
  const lastEmployeeElementRef = useCallback(node => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setCurrentPage(prevPage => prevPage + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

 

  const fetchEmployees = useCallback(async (page, isNewSearch = false) => {
    if (loading) return; // منع الطلبات المتعددة في نفس الوقت
    setLoading(true);
    try {
      const params = {
        page: page,
        limit: limit,
        q: searchQuery || undefined,
        role_id: filterRole !== "all" ? parseInt(filterRole) : undefined,
        show_deleted: activeTab === 'deleted',
        is_active: activeTab === 'active' ? true : (activeTab === 'inactive' ? false : undefined)
      };

      const response = await axios.get(`${API_BASE_URL}/users/mini-list`, { 
        params,
        ...getAuthHeaders() 
      });

      const newEmployees = response.data.users;
      setEmployees(prev => isNewSearch ? newEmployees : [...prev, ...newEmployees]);
      setTotalCount(response.data.total);
      setHasMore(newEmployees.length === limit);
    } catch (error) {
      toast.error("فشل في جلب البيانات");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterRole, activeTab, activeTab]);

  useEffect(() => {
    setCurrentPage(1);
    fetchEmployees(1, true);
  }, [searchQuery, filterRole, activeTab]);

  useEffect(() => {
    if (currentPage > 1) {
      fetchEmployees(currentPage, false);
    }
  }, [currentPage]);

  const handleShowStats = async (userId) => {
    setLoadingStats(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/users/${userId}/activity`, getAuthHeaders());
      setSelectedEmployeeStats(response.data);
      setIsStatsModalOpen(true);
    } catch (error) {
      toast.error("فشل في جلب إحصائيات الأداء");
    } finally {
      setLoadingStats(false);
    }
  };

  const handleSoftDelete = async (userId, userNameOrRestore) => {
    const isRestore = typeof userNameOrRestore === 'boolean' ? userNameOrRestore : false;
    const displayName = typeof userNameOrRestore === 'string' ? userNameOrRestore : "هذا الموظف";
  
    if (!isRestore && !window.confirm(`هل أنت متأكد من نقل الموظف "${displayName}" إلى سلة المحذوفات؟`)) return;
  
    try {
      if (isRestore) {
        // --- استخدام الدالة الجديدة للاستعادة ---
        await restoreEmployeeApi(userId);
        
        // تحديث فوري: إزالة الموظف من قائمة "المحذوفين" الظاهرة حالياً
        setEmployees(prev => prev.filter(emp => emp.id !== userId));
        toast.success("تم استعادة الموظف بنجاح");
      } else {
        // حالة الحذف
        await deleteEmployeeApi(userId);
        
        // تحديث فوري: إزالة الموظف من قائمة "النشطين" الظاهرة حالياً
        setEmployees(prev => prev.filter(emp => emp.id !== userId));
        toast.success("تم نقل الموظف إلى السلة");
      }
      
      // تحديث العداد الإجمالي (اختياري)
      setTotalCount(prev => isRestore ? prev + 1 : prev - 1);
  
    } catch (error) {
      console.error("Operation error:", error.response?.data);
      toast.error(error.response?.data?.detail || "فشلت العملية، تأكد من الصلاحيات");
    }
  };

  const getRoleStyles = (roleId) => {
    switch(roleId) {
      case 1: return { bg: "bg-rose-50", text: "text-rose-600", border: "border-rose-100", icon: <ShieldCheck className="h-3 w-3" /> };
      case 2: return { bg: "bg-purple-50", text: "text-purple-600", border: "border-purple-100", icon: <UserCog className="h-3 w-3" /> };
      default: return { bg: "bg-blue-50", text: "text-blue-600", border: "border-blue-100", icon: <UserCircle className="h-3 w-3" /> };
    }
  };

  const handleEditClick = (employee) => {
    setEmployeeToEdit(employee); 
    setIsEditModalOpen(true);    
  };

  return (
    <div className="p-4 md:p-8 space-y-6 pb-32 animate-in fade-in duration-500 font-arabic" dir="rtl">
      
      {/* Header & Search */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex flex-col gap-4 w-full lg:w-auto">
          <div className="flex items-center gap-3">
             <div className="flex bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
                <TabButton label="النشطين" active={activeTab === 'active'} onClick={() => setActiveTab('active')} />
                <TabButton label="المحذوفين" active={activeTab === 'deleted'} onClick={() => setActiveTab('deleted')} />
              </div>
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="text-xs font-black text-slate-600">{totalCount}</span>
              </div>
          </div>

          <div className="relative group">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#800000]" />
            <input 
              type="text"
              placeholder="ابحث..."
              className="w-full lg:w-80 h-11 pr-11 pl-4 bg-slate-50 border-transparent rounded-xl text-sm focus:bg-white focus:border-[#800000]/20 transition-all outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select 
            className="h-11 px-4 bg-slate-50 rounded-xl text-sm font-bold text-slate-600 outline-none cursor-pointer border border-transparent"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            <option value="all">كل الرتب</option>
            <option value="1">مسؤول</option>
            <option value="2">مدير</option>
            <option value="3">موظف</option>
          </select>

          <button 
            onClick={() => setIsAddModalOpen(true)}
             className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2 bg-[#800000] text-white px-6 h-11 rounded-xl font-bold shadow-lg shadow-[#800000]/20 hover:scale-105 transition-transform"
          >
            <UserPlus className="h-4 w-4" />
            إضافة
         </button>
        </div>
      </div>

      {/* Employee List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {employees.map((emp, index) => {
          const isLastElement = employees.length === index + 1;
          const roleStyle = getRoleStyles(emp.role_id);
          const isCurrentlyLoading = loadingStats && selectedEmployeeStats?.user_id === emp.id;
          
          return (
            <div 
              ref={isLastElement ? lastEmployeeElementRef : null}
              key={emp.id}
              className={cn(
                "group relative flex items-center p-5 bg-white border border-slate-200 rounded-[2rem] transition-all hover:shadow-md hover:border-slate-300",
                (!emp.is_active || emp.is_deleted) && "bg-slate-50/80 border-dashed opacity-80"
              )}
            >
              <div 
                onClick={() => handleShowStats(emp.id)}
                className={cn(
                  "h-12 w-12 rounded-full flex items-center justify-center shrink-0 shadow-md border-2 border-white cursor-pointer hover:scale-110 transition-transform",
                  emp.is_active && !emp.is_deleted ? "bg-[#800000] text-white" : "bg-slate-300 text-slate-600"
                )}
              >
                {isCurrentlyLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <span className="text-sm font-black">{emp.name.substring(0, 2).toUpperCase()}</span>}
              </div>
              
              <div className="mr-4 flex-1 cursor-pointer" onClick={() => handleShowStats(emp.id)}>
                <h3 className="font-black text-slate-900 text-base leading-tight group-hover:text-[#800000] transition-colors">{emp.name}</h3>
                <p className="text-slate-400 text-[11px] font-bold mt-0.5">{emp.phone}</p>
                <div className={cn(
                  "inline-flex items-center gap-1.5 mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-black border",
                  roleStyle.bg, roleStyle.text, roleStyle.border
                )}>
                  {roleStyle.icon}
                  <span className="uppercase tracking-wider">{emp.role_name}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                 <button 
                   onClick={() => handleShowStats(emp.id)}
                   className="p-2 text-slate-400 hover:text-[#800000] hover:bg-slate-50 rounded-xl transition-all"
                 >
                   {isCurrentlyLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Eye className="h-5 w-5" />}
                 </button>

                 <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button className="p-2 text-slate-400 hover:bg-slate-100 rounded-full outline-none transition-colors">
                      <MoreVertical className="h-5 w-5" />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content className="min-w-[160px] bg-white rounded-2xl p-2 shadow-2xl border border-slate-100 z-[100] font-arabic" sideOffset={5} align="end">
                      {emp.is_deleted ? (
                        <DropdownMenu.Item 
                          onClick={() => handleSoftDelete(emp.id, true)} 
                          className="flex items-center gap-3 px-3 py-2 text-sm font-bold text-emerald-600 rounded-xl hover:bg-emerald-50 outline-none cursor-pointer"
                        >
                          <RotateCcw className="h-4 w-4" /> استعادة
                        </DropdownMenu.Item>
                      ) : (
                        <>
                       <DropdownMenu.Item 
                         onClick={() => handleEditClick(emp)} // أضف هذا السطر لربط الموظف الحالي بالدالة
                         className="flex items-center gap-3 px-3 py-2 text-sm font-bold text-slate-700 rounded-xl hover:bg-slate-50 outline-none cursor-pointer"
                        >
                         <Pencil className="h-4 w-4" /> تعديل
                       </DropdownMenu.Item>
                          <DropdownMenu.Separator className="h-px bg-slate-100 my-1" />
                          <DropdownMenu.Item 
                            onClick={() => handleSoftDelete(emp.id, emp.name)} 
                            className="flex items-center gap-3 px-3 py-2 text-sm font-bold text-red-600 rounded-xl hover:bg-red-50 outline-none cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" /> نقل للسلة
                          </DropdownMenu.Item>
                        </>
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            </div>
          );
        })}

        {/* مودال التعديل - نستخدم نفس مكون الإضافة لكن نمرر له البيانات */}
       <AddEmployeeModal 
         isOpen={isEditModalOpen} 
         onClose={() => {
           setIsEditModalOpen(false);
           setEmployeeToEdit(null); // تصفير البيانات عند الإغلاق
         }} 
         onRefresh={() => fetchEmployees(1, true)} 
         initialData={employeeToEdit} // هذا هو السطر الأهم لتمرير البيانات القديمة
       />
      </div>

      <EmployeeDetailsModal 
        isOpen={isStatsModalOpen} 
        onClose={() => setIsStatsModalOpen(false)} 
        employeeStats={selectedEmployeeStats} 
      />

      <AddEmployeeModal 
        isOpen={isAddModalOpen} 
        onClose={() => setIsAddModalOpen(false)} 
        onRefresh={() => fetchEmployees(1, true)} 
      />

      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-[#800000]" />
        </div>
      )}

      {!hasMore && employees.length > 0 && (
        <p className="text-center text-slate-400 text-xs font-bold py-10">وصلت إلى نهاية القائمة</p>
      )}
    </div>
  );
};

const TabButton = ({ label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={cn(
      "px-5 py-2 rounded-lg text-xs font-black transition-all shrink-0",
      active ? "bg-white text-[#800000] shadow-sm" : "text-slate-500"
    )}
  >
    {label}
  </button>
);


export default Employees;