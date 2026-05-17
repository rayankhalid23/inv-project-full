import axios from 'axios';

// إعداد الرابط الأساسي للباك إند (تأكد من مطابقة المنفذ لما في FastAPI)
const API_URL = 'http://localhost:8000'; 

/**
 * دالة جلب التوكن وإعداد الهيدرز
 * يتم استدعاؤها داخلياً قبل كل طلب يحتاج مصادقة
 */
const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
};

/**
 * 1. جلب قائمة الموظفين (المصغرة) مع الفلترة والتجزئة
 * ترتبط بدالة الباك إند: get_all_users_mini
 */
export const fetchEmployeesApi = async (params) => {
    try {
        const response = await axios.get(`${API_URL}/users/mini-list`, {
            params, // تشمل: q, role_id, is_active, show_deleted, page, limit
            ...getAuthHeaders()
        });
        return response.data; // ترجع { users: [], total: int }
    } catch (error) {
        console.error("Fetch Employees Error:", error);
        throw error;
    }
};

/**
 * 2. تحديث بيانات مستخدم معين
 * ترتبط بالراوتر: @router.patch("/users/{user_id}")
 */
export const updateProfile = async (user_id, userData) => {
    try {
        const response = await axios.patch(
            `${API_URL}/users/${user_id}`, 
            userData, 
            getAuthHeaders()
        );
        return response.data;
    } catch (error) {
        console.error("Update Profile Error:", error);
        throw error;
    }
};

export const deleteEmployeeApi = async (userId) => {
    try {
        // التعديل 1: استخدام axios.delete لأن الباك إند يستخدم @router.delete
        // التعديل 2: تصحيح الرابط بإزالة كلمة "/delete" الإضافية لأن المسار في الباك هو "/{user_id}" فقط
        // التعديل 3: تصحيح اسم المتغير من user_id إلى userId ليطابق المعامل (Parameter)
        const response = await axios.delete(
            `${API_URL}/users/${userId}`, 
            getAuthHeaders() // في axios.delete، الـ headers تكون المعامل الثاني (ولا يوجد body)
        );
        return response.data;
    } catch (error) {
        console.error("API Error Details:", error.response?.data);
        throw error;
    }
};


export const fetchEmployeeFullDetails = async (user_id) => {
    try {
        const response = await axios.get(
            // تم تغيير full-stats إلى details بناءً على التوثيق في الصورة
            `${API_URL}/users/${user_id}/details`, 
            getAuthHeaders()
        );

        console.log("استجابة ناجحة من الباك إند:", response.data);
        return response.data;
    } catch (error) {
        console.error("خطأ في الربط: تأكد من أن الـ user_id صحيح والرابط مطابق للصورة");
        throw error;
    }
};


// دالة استعادة الموظف من الأرشيف
export const restoreEmployeeApi = async (userId) => {
    try {
        // نستخدم POST لأن الباك إند معرف بـ @router.post
        // والمسار ينتهي بـ /restore كما هو في FastAPI
        const response = await axios.post(
            `${API_URL}/users/${userId}/restore`, 
            {}, // نرسل body فارغ
            getAuthHeaders()
        );
        return response.data;
    } catch (error) {
        console.error("Restore API Error:", error.response?.data);
        throw error;
    }
};

export const createEmployeeApi = async (userData) => {
    try {
        const response = await axios.post(
            `${API_URL}/users/`, 
            {
                name: userData.name,
                phone: userData.phone,
                password: userData.password,
                role_id: parseInt(userData.role_id) 
            },
            getAuthHeaders()
        );
        return response.data;
    } catch (error) {
        console.error("Create User API Error:", error.response?.data);
        throw error;
    }
};



/**
 * دالة تحديث بيانات الموظف
 * @param {number} id - معرف الموظف المراد تعديله
 * @param {object} data - البيانات الجديدة (name, phone, password, role_id)
 */
export const updateEmployeeApi = async (id, data) => {
    try {
      const cleanData = { ...data };
      
      // تنظيف كلمة المرور إذا كانت فارغة
      if (!cleanData.password || cleanData.password.trim() === '') {
        delete cleanData.password;
      }
  
      // تصحيح الخطأ هنا: تم تغيير API_BASE_URL إلى API_URL
      const response = await axios.patch(
        `${API_URL}/users/${id}`, 
        cleanData, 
        getAuthHeaders() // استخدام الدالة الموحدة للهيدرز
      );
  
      return response.data;
    } catch (error) {
      throw error;
    }
};


