// Client-side Application Controller for Hùng Vương Concert Scheduler

let currentAdminToken = localStorage.getItem("hv_admin_token") || null;
let currentUserRole = "staff";

document.addEventListener("DOMContentLoaded", async () => {
    initThemeToggle();
    initTabs();
    initMoreMenu();
    initModals();
    initEventListeners();
    await checkAuthStatus();
    loadCurrentSchedule();
    loadCaNgoaiList();
    loadHeatmapData();
    loadIncidentLogs();
    loadProtocols();
    loadInventoryData();
});

let globalScheduleData = null;
let globalShifts = [];
let globalMembers = [];
let globalCaNgoai = [];
let globalPreviewData = null;
let globalInventoryData = { products: [], sales_logs: [] };
let globalIncidentLogs = [];
let currentEditingShift = null;

// Ba tab này không nằm ở thanh đáy trên điện thoại; chúng ở trong bảng "Thêm".
const MORE_TABS = ["tab-inventory", "tab-audit", "tab-protocols", "tab-kpi"];

// AUTHENTICATION & RBAC HELPERS
async function authFetch(url, options = {}) {
    options.headers = options.headers || {};
    if (currentAdminToken) {
        if (options.headers instanceof Headers) {
            options.headers.set("Authorization", `Bearer ${currentAdminToken}`);
        } else {
            options.headers["Authorization"] = `Bearer ${currentAdminToken}`;
        }
    }
    const response = await fetch(url, options);
    if (response.status === 401) {
        const cloned = response.clone();
        try {
            const data = await cloned.json();
            if (data.require_admin) {
                openAdminLoginModal(
                    data.message ||
                        "Thao tác này yêu cầu quyền Quản trị viên. Vui lòng đăng nhập để tiếp tục.",
                );
            }
        } catch (e) {}
    }
    return response;
}

async function checkAuthStatus() {
    try {
        const res = await authFetch("/api/auth/status");
        const data = await res.json();
        currentUserRole = data.role || (data.is_admin ? "admin" : "staff");
        updateAuthUI(data.is_admin === true);
    } catch (e) {
        currentUserRole = "staff";
        updateAuthUI(false);
    }
}

function applyTheme(theme) {
    const isLight = theme === "light";
    document.body.classList.toggle("light-theme", isLight);
    document.body.classList.toggle("dark-theme", !isLight);

    const toggleBtn = document.getElementById("themeToggle");
    const themeIcon = document.getElementById("themeIcon");
    const themeLabel = document.getElementById("themeLabel");
    if (toggleBtn) {
        toggleBtn.setAttribute(
            "aria-label",
            isLight
                ? "Chuyển sang giao diện tối"
                : "Chuyển sang giao diện sáng",
        );
        toggleBtn.title = isLight
            ? "Chuyển sang giao diện tối"
            : "Chuyển sang giao diện sáng";
    }
    if (themeIcon) {
        themeIcon.className = isLight ? "fa-solid fa-moon" : "fa-solid fa-sun";
    }
    if (themeLabel) {
        themeLabel.textContent = isLight ? "Dark" : "Light";
    }

    localStorage.setItem("hv_theme", isLight ? "light" : "dark");
}

function initThemeToggle() {
    const savedTheme = localStorage.getItem("hv_theme");
    const prefersLight =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: light)").matches;
    const initialTheme = savedTheme || (prefersLight ? "light" : "dark");
    applyTheme(initialTheme);

    const toggleBtn = document.getElementById("themeToggle");
    toggleBtn?.addEventListener("click", () => {
        const isLight = document.body.classList.contains("light-theme");
        applyTheme(isLight ? "dark" : "light");
    });
}

function updateAuthUI(isAdmin) {
    document.body.classList.toggle("admin-mode", isAdmin);
    document.body.classList.toggle("staff-mode", !isAdmin);

    const roleBadge = document.getElementById("roleBadge");
    const roleIcon = document.getElementById("roleIcon");
    const roleText = document.getElementById("roleText");
    const btnToggle = document.getElementById("btnAuthToggle");
    const btnIcon = document.getElementById("btnAuthIcon");
    const btnText = document.getElementById("btnAuthText");
    const btnChangePwd = document.getElementById("btnOpenChangePwdModal");

    if (isAdmin) {
        if (roleBadge) {
            roleBadge.className = "role-badge admin-role";
            if (roleIcon) roleIcon.className = "fa-solid fa-shield-halved";
            if (roleText) roleText.textContent = "Quản Trị Viên";
        }
        if (btnToggle) {
            btnToggle.className = "btn-auth-toggle btn-logout";
            if (btnIcon) btnIcon.className = "fa-solid fa-right-from-bracket";
            if (btnText) btnText.textContent = "Đăng xuất Admin";
            btnToggle.title = "Thoát khỏi chế độ Quản trị viên";
        }
        if (btnChangePwd) btnChangePwd.style.display = "inline-flex";
    } else {
        if (roleBadge) {
            roleBadge.className = "role-badge staff-role";
            if (roleIcon) roleIcon.className = "fa-solid fa-user-check";
            if (roleText) roleText.textContent = "Chế độ Nhân Viên";
        }
        if (btnToggle) {
            btnToggle.className = "btn-auth-toggle btn-login";
            if (btnIcon) btnIcon.className = "fa-solid fa-lock";
            if (btnText) btnText.textContent = "Đăng nhập Admin";
            btnToggle.title = "Đăng nhập để chỉnh sửa ca và kho hàng";
        }
        if (btnChangePwd) btnChangePwd.style.display = "none";
    }

    // Re-render components with role considerations
    if (globalScheduleData) {
        renderDutyBoard();
        renderMemberTable();
    }
    if (globalInventoryData && globalInventoryData.products) {
        renderInventoryTable(globalInventoryData.products);
    }
}

function openAdminLoginModal(notice) {
    const modal = document.getElementById("adminLoginModal");
    const msg = document.getElementById("adminLoginMsg");
    const input = document.getElementById("inputAdminPassword");
    if (!modal) return;

    if (msg) {
        if (notice) {
            msg.className = "swap-msg info";
            msg.textContent = notice;
            msg.style.display = "block";
        } else {
            msg.style.display = "none";
            msg.textContent = "";
        }
    }
    if (input) {
        input.value = "";
        setTimeout(() => input.focus(), 150);
    }
    modal.classList.add("active");
}

function closeAdminLoginModal() {
    const modal = document.getElementById("adminLoginModal");
    if (modal) modal.classList.remove("active");
}

function openChangePasswordModal() {
    const modal = document.getElementById("changePasswordModal");
    const msg = document.getElementById("changePwdMsg");
    if (!modal) return;
    if (msg) {
        msg.style.display = "none";
        msg.textContent = "";
    }
    document.getElementById("inputOldPassword").value = "";
    document.getElementById("inputNewPassword").value = "";
    document.getElementById("inputConfirmNewPassword").value = "";
    modal.classList.add("active");
}

function closeChangePasswordModal() {
    const modal = document.getElementById("changePasswordModal");
    if (modal) modal.classList.remove("active");
}

// Tab Switching
function initTabs() {
    const navItems = document.querySelectorAll(".nav-item");
    const tabContents = document.querySelectorAll(".tab-content");
    const pageTitle = document.getElementById("pageTitle");
    const moreBtn = document.getElementById("btnMoreMenu");

    const titles = {
        "tab-schedule": "Lịch Trực Toàn Bộ Các Ngày Trong Tuần",
        "tab-optimizer":
            "Tinh Chỉnh Tham Số, Tối Ưu Hóa & Ca Bán Ngoài (OR-Tools)",
        "tab-inventory": "Kho Hàng & Quản Lý Doanh Thu F&B",
        "tab-ca-ngoai": "Quản Lý & Phân Bổ Ca Bán Ngoài",
        "tab-analytics": "Báo Cáo Thống Kê & Heatmap Thời Gian Rảnh",
        "tab-kpi": "Theo Dõi & Điểm Danh KPI Chuyên Cần Nhân Sự",
        "tab-audit": "Kiểm Tra Tính Hợp Lệ & Thẩm Định Quy Chuẩn",
        "tab-contingency": "Quản Lý Ca Vắng, Đi Trễ & Nhân Sự Dự Phòng",
        "tab-protocols":
            "Quy Trình Quản Trị Nhân Sự & Dự Trù Rủi Ro (Nhiệm Vụ 2)",
        "tab-live-shift": "Ca-Live & POS Bán Hàng Realtime",
    };

    navItems.forEach((item) => {
        const label = item.querySelector(".nav-full")?.textContent.trim();
        if (label && !item.title) item.title = label;

        item.addEventListener("click", () => {
            let targetTab = item.getAttribute("data-tab");
            if (!targetTab) return;
            if (targetTab === "tab-ca-ngoai") targetTab = "tab-optimizer";

            // Protect optimizer tab for Admin only
            if (targetTab === "tab-optimizer" && currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Mục Tinh Chỉnh & Tối Ưu Lịch Trực yêu cầu quyền Quản trị viên (Admin). Vui lòng đăng nhập Admin để truy cập.",
                );
                return;
            }

            navItems.forEach((n) => n.classList.remove("active"));
            tabContents.forEach((t) => t.classList.remove("active"));

            item.classList.add("active");
            const targetEl = document.getElementById(targetTab);
            if (targetEl) targetEl.classList.add("active");

            if (moreBtn)
                moreBtn.classList.toggle(
                    "active",
                    MORE_TABS.includes(targetTab),
                );

            if (targetTab === "tab-inventory") {
                loadInventoryData();
            } else if (targetTab === "tab-kpi") {
                loadKpiData();
            }

            if (pageTitle && titles[targetTab]) {
                pageTitle.textContent = titles[targetTab];
            }
        });
    });
}

function initMoreMenu() {
    const sheet = document.getElementById("moreSheet");
    const trigger = document.getElementById("btnMoreMenu");
    if (!sheet || !trigger) return;

    const setOpen = (open) => {
        sheet.classList.toggle("active", open);
        trigger.setAttribute("aria-expanded", String(open));
    };

    trigger.addEventListener("click", () =>
        setOpen(!sheet.classList.contains("active")),
    );
    sheet.addEventListener("click", (e) => {
        if (e.target === sheet) setOpen(false);
    });
    sheet
        .querySelectorAll(".nav-item")
        .forEach((b) => b.addEventListener("click", () => setOpen(false)));
    document.getElementById("btnMorePreview")?.addEventListener("click", () => {
        setOpen(false);
        openPreviewModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sheet.classList.contains("active"))
            setOpen(false);
    });
}

// Confirmation Modal System (2-step confirmation)
let currentConfirmCallback = null;

function openConfirmModal({
    title,
    message,
    confirmBtnText = "Xác Nhận Xóa",
    onConfirm,
}) {
    const modal = document.getElementById("confirmModal");
    const titleEl = document.getElementById("confirmModalTitle");
    const msgEl = document.getElementById("confirmModalMessage");
    const btnProceed = document.getElementById("btnConfirmProceed");
    if (!modal) return;

    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>${esc(title || "Xác Nhận Hành Động")}</span>`;
    }
    if (msgEl) {
        msgEl.innerHTML = esc(
            message || "Bạn có chắc chắn muốn thực hiện hành động này?",
        );
    }
    if (btnProceed) {
        btnProceed.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${esc(confirmBtnText)}`;
    }
    currentConfirmCallback = onConfirm;
    modal.classList.add("active");
}

function closeConfirmModal() {
    const modal = document.getElementById("confirmModal");
    if (modal) modal.classList.remove("active");
    currentConfirmCallback = null;
}

function initModals() {
    // Shift Edit Modal
    const shiftModal = document.getElementById("shiftEditModal");
    document
        .getElementById("btnCloseShiftModal")
        ?.addEventListener("click", () =>
            shiftModal.classList.remove("active"),
        );
    document
        .getElementById("btnCancelShiftEdit")
        ?.addEventListener("click", () =>
            shiftModal.classList.remove("active"),
        );

    // Upload Data Modal
    const uploadModal = document.getElementById("uploadDataModal");
    document
        .getElementById("btnOpenUploadModal")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để nạp dữ liệu lịch trực!",
                );
                return;
            }
            uploadModal.classList.add("active");
        });
    document
        .getElementById("btnCloseUploadModal")
        ?.addEventListener("click", () =>
            uploadModal.classList.remove("active"),
        );

    // Preview Modal
    const previewModal = document.getElementById("previewModal");
    document
        .getElementById("btnOpenPreviewModal")
        ?.addEventListener("click", openPreviewModal);
    document
        .getElementById("btnClosePreviewModal")
        ?.addEventListener("click", () =>
            previewModal.classList.remove("active"),
        );

    // Product Modal
    const productModal = document.getElementById("productModal");
    document
        .getElementById("btnCloseProductModal")
        ?.addEventListener("click", () =>
            productModal?.classList.remove("active"),
        );
    document
        .getElementById("btnCancelProductModal")
        ?.addEventListener("click", () =>
            productModal?.classList.remove("active"),
        );

    // Sale Modal
    const saleModal = document.getElementById("recordSaleModal");
    document
        .getElementById("btnCloseSaleModal")
        ?.addEventListener("click", () =>
            saleModal?.classList.remove("active"),
        );
    document
        .getElementById("btnCancelSaleModal")
        ?.addEventListener("click", () =>
            saleModal?.classList.remove("active"),
        );

    // Admin Login Modal
    document
        .getElementById("btnCloseLoginModal")
        ?.addEventListener("click", closeAdminLoginModal);
    document
        .getElementById("btnCancelLoginModal")
        ?.addEventListener("click", closeAdminLoginModal);

    // Change Password Modal
    document
        .getElementById("btnCloseChangePwdModal")
        ?.addEventListener("click", closeChangePasswordModal);
    document
        .getElementById("btnCancelChangePwdModal")
        ?.addEventListener("click", closeChangePasswordModal);
    document
        .getElementById("btnOpenChangePwdModal")
        ?.addEventListener("click", openChangePasswordModal);

    // Confirmation Modal (2-step)
    document
        .getElementById("btnCloseConfirmModal")
        ?.addEventListener("click", closeConfirmModal);
    document
        .getElementById("btnConfirmCancel")
        ?.addEventListener("click", closeConfirmModal);
    document
        .getElementById("btnConfirmProceed")
        ?.addEventListener("click", async () => {
            if (typeof currentConfirmCallback === "function") {
                const cb = currentConfirmCallback;
                closeConfirmModal();
                await cb();
            } else {
                closeConfirmModal();
            }
        });

    // Close modals on clicking backdrop
    document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) {
                backdrop.classList.remove("active");
                if (backdrop.id === "confirmModal")
                    currentConfirmCallback = null;
            }
        });
    });
}

function initEventListeners() {
    // Auth Toggle Button (Login / Logout)
    document
        .getElementById("btnAuthToggle")
        ?.addEventListener("click", async () => {
            if (currentUserRole === "admin") {
                // Logout
                try {
                    await authFetch("/api/auth/logout", { method: "POST" });
                } catch (e) {}
                currentAdminToken = null;
                currentUserRole = "staff";
                localStorage.removeItem("hv_admin_token");
                updateAuthUI(false);
            } else {
                // Open Login
                openAdminLoginModal();
            }
        });

    // Toggle show/hide password
    document
        .getElementById("btnToggleShowPassword")
        ?.addEventListener("click", () => {
            const inp = document.getElementById("inputAdminPassword");
            const icon = document.getElementById("iconShowPassword");
            if (!inp) return;
            if (inp.type === "password") {
                inp.type = "text";
                if (icon) icon.className = "fa-solid fa-eye-slash";
            } else {
                inp.type = "password";
                if (icon) icon.className = "fa-solid fa-eye";
            }
        });

    // Admin Login Form Submit
    document
        .getElementById("adminLoginForm")
        ?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const pwd =
                document.getElementById("inputAdminPassword")?.value || "";
            const remember =
                document.getElementById("chkRememberAdmin")?.checked;
            const msg = document.getElementById("adminLoginMsg");

            if (!pwd) return;
            if (msg) {
                msg.className = "swap-msg info";
                msg.textContent = "Đang xác thực mật khẩu...";
                msg.style.display = "block";
            }

            try {
                const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: pwd }),
                });
                const data = await res.json();
                if (data.success && data.token) {
                    currentAdminToken = data.token;
                    currentUserRole = "admin";
                    if (remember) {
                        localStorage.setItem("hv_admin_token", data.token);
                    } else {
                        sessionStorage.setItem("hv_admin_token", data.token);
                    }
                    if (msg) {
                        msg.className = "swap-msg success";
                        msg.textContent =
                            "Đăng nhập thành công! Đang kích hoạt quyền Quản trị viên...";
                    }
                    updateAuthUI(true);
                    setTimeout(() => {
                        closeAdminLoginModal();
                    }, 700);
                } else {
                    if (msg) {
                        msg.className = "swap-msg error";
                        msg.textContent =
                            data.message ||
                            "Mật khẩu Quản trị viên không đúng!";
                    }
                }
            } catch (err) {
                if (msg) {
                    msg.className = "swap-msg error";
                    msg.textContent = "Lỗi kết nối máy chủ: " + err.message;
                }
            }
        });

    // Change Password Form Submit
    document
        .getElementById("changePasswordForm")
        ?.addEventListener("submit", async (e) => {
            e.preventDefault();
            const oldPwd =
                document.getElementById("inputOldPassword")?.value || "";
            const newPwd =
                document.getElementById("inputNewPassword")?.value || "";
            const confirmPwd =
                document.getElementById("inputConfirmNewPassword")?.value || "";
            const msg = document.getElementById("changePwdMsg");

            if (newPwd !== confirmPwd) {
                if (msg) {
                    msg.className = "swap-msg error";
                    msg.textContent =
                        "Mật khẩu mới và xác nhận mật khẩu không khớp nhau!";
                    msg.style.display = "block";
                }
                return;
            }

            if (msg) {
                msg.className = "swap-msg info";
                msg.textContent = "Đang đổi mật khẩu...";
                msg.style.display = "block";
            }

            try {
                const res = await authFetch("/api/auth/change-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        old_password: oldPwd,
                        new_password: newPwd,
                    }),
                });
                const data = await res.json();
                if (data.success) {
                    if (msg) {
                        msg.className = "swap-msg success";
                        msg.textContent =
                            data.message || "Đổi mật khẩu thành công!";
                    }
                    setTimeout(() => {
                        closeChangePasswordModal();
                    }, 1200);
                } else {
                    if (msg) {
                        msg.className = "swap-msg error";
                        msg.textContent =
                            data.message || "Đổi mật khẩu thất bại!";
                    }
                }
            } catch (err) {
                if (msg) {
                    msg.className = "swap-msg error";
                    msg.textContent = "Lỗi máy chủ: " + err.message;
                }
            }
        });

    // Quick optimize button
    document
        .getElementById("btnQuickOptimize")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để chạy thuật toán tối ưu xếp ca!",
                );
                return;
            }
            runOptimizerWithParams({});
        });

    // Member Stats Search input
    document
        .getElementById("memberStatsSearchInput")
        ?.addEventListener("input", () => {
            renderMemberTable();
        });

    // Optimizer Form
    document
        .getElementById("optimizerForm")
        ?.addEventListener("submit", (e) => {
            e.preventDefault();
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để chạy thuật toán tối ưu xếp ca!",
                );
                return;
            }
            const startDate =
                document.getElementById("cfgStartDate")?.value || "2026-08-24";
            const phongChinh = document.getElementById("cfgPhongChinh").value;
            const phongDP = document.getElementById("cfgPhongDP").value;
            const minShifts = document.getElementById("cfgMinShifts").value;
            const maxShifts = document.getElementById("cfgMaxShifts").value;
            const maxDaily = document.getElementById("cfgMaxDaily").value;
            const enableNgoai = document.getElementById("chkMasterNgoai")
                ? document.getElementById("chkMasterNgoai").checked
                : true;

            runOptimizerWithParams({
                start_date: startDate,
                phong_chinh_count: phongChinh,
                phong_dp_count: phongDP,
                min_shifts: minShifts,
                max_shifts: maxShifts,
                max_shifts_per_day: maxDaily,
                enable_ca_ngoai: enableNgoai,
                custom_ca_ngoai: globalCaNgoai,
            });
        });

    // Inventory Event Listeners
    document
        .getElementById("btnOpenAddProductModal")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để thêm sản phẩm mới vào kho hàng!",
                );
                return;
            }
            openProductModalForAdd();
        });
    document
        .getElementById("btnOpenRecordSaleModal")
        ?.addEventListener("click", () => openQuickSaleModal());
    document
        .getElementById("productForm")
        ?.addEventListener("submit", handleSaveProduct);
    document
        .getElementById("recordSaleForm")
        ?.addEventListener("submit", handleSaveSale);
    document
        .getElementById("saleSelectProduct")
        ?.addEventListener("change", updateSaleCalcTotal);
    document
        .getElementById("saleInputQty")
        ?.addEventListener("input", updateSaleCalcTotal);

    // Master Toggle Ca Ngoài (Enable/Disable below section)
    const masterNgoaiCheckbox = document.getElementById("chkMasterNgoai");
    masterNgoaiCheckbox?.addEventListener("change", async (e) => {
        if (currentUserRole !== "admin") {
            e.preventDefault();
            e.target.checked = !e.target.checked;
            openAdminLoginModal(
                "Bạn cần đăng nhập quyền Quản trị viên để thay đổi cài đặt ca bán ngoài!",
            );
            return;
        }
        const enabled = e.target.checked;
        updateCaNgoaiPanelState(enabled);
        await authFetch("/api/ca-ngoai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: enabled }),
        });
    });

    // Add Ca Ngoài Form
    document
        .getElementById("formAddCaNgoai")
        ?.addEventListener("submit", async (e) => {
            e.preventDefault();
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để thêm ca bán ngoài!",
                );
                return;
            }
            const name = document.getElementById("inputNgoaiName").value.trim();
            const day = document.getElementById("selectNgoaiDay").value;
            const startT = document
                .getElementById("inputNgoaiStart")
                .value.trim();
            const endT = document.getElementById("inputNgoaiEnd").value.trim();
            const chinh = parseInt(
                document.getElementById("selectNgoaiChinh").value,
            );
            const dp = parseInt(document.getElementById("selectNgoaiDP").value);

            if (!name) return;

            const newItem = {
                name: name,
                day: day,
                start_time: startT,
                end_time: endT,
                chinh: chinh,
                dp: dp,
            };

            const res = await authFetch("/api/ca-ngoai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add", item: newItem }),
            });
            const data = await res.json();
            if (data.success) {
                globalCaNgoai = data.list;
                renderCaNgoaiTable();
                document.getElementById("inputNgoaiName").value = "";
            }
        });

    // Clear all Ca Ngoài with 2-step confirmation modal
    document
        .getElementById("btnClearAllCaNgoai")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để xóa ca bán ngoài!",
                );
                return;
            }
            openConfirmModal({
                title: "Xác Nhận Xóa Tất Cả Ca Bán Ngoài",
                message:
                    "Bạn có chắc chắn muốn xóa tất cả các ca bán ngoài? Toàn bộ danh sách điểm ca ngoài đã cấu hình sẽ bị xóa.",
                confirmBtnText: "Xác Nhận Xóa Hết",
                onConfirm: async () => {
                    try {
                        const res = await authFetch("/api/ca-ngoai", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "clear" }),
                        });
                        const data = await res.json();
                        if (data.success) {
                            globalCaNgoai = [];
                            renderCaNgoaiTable();
                            loadCurrentSchedule();
                        }
                    } catch (e) {
                        console.error("Error clearing ca ngoai:", e);
                    }
                },
            });
        });

    // Reset Incidents / Late Attendance History with 2-step confirmation modal
    document
        .getElementById("btnResetIncidents")
        ?.addEventListener("click", () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để xóa lịch sử điểm danh!",
                );
                return;
            }
            openConfirmModal({
                title: "Xác Nhận Xóa Lịch Sử Điểm Danh & Sự Cố",
                message:
                    "Bạn có chắc chắn muốn xóa toàn bộ lịch sử điểm danh, báo cáo đi trễ, vắng mặt và nhân sự thay thế? Dữ liệu này sẽ được đặt lại về 0.",
                confirmBtnText: "Xóa Lịch Sử",
                onConfirm: async () => {
                    try {
                        const res = await authFetch("/api/contingency/reset", {
                            method: "POST",
                        });
                        const data = await res.json();
                        if (data.success) {
                            loadIncidentLogs();
                            loadCurrentSchedule();
                        }
                    } catch (e) {
                        console.error("Error resetting incidents:", e);
                    }
                },
            });
        });

    // Filter Listeners
    document.querySelectorAll("#channelFilter .filter-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll("#channelFilter .filter-btn")
                .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderDutyBoard();
        });
    });

    document
        .getElementById("dayFilter")
        ?.addEventListener("change", renderDutyBoard);
    document
        .getElementById("memberSearchInput")
        ?.addEventListener("input", renderDutyBoard);

    // Upload & Sync Data
    document
        .getElementById("btnSyncGoogleSheet")
        ?.addEventListener("click", handleSyncGoogleSheet);
    document
        .getElementById("btnUploadFile")
        ?.addEventListener("click", handleUploadFile);

    // Shift Edit Save
    document
        .getElementById("btnSaveShiftEdit")
        ?.addEventListener("click", handleSaveShiftEdit);

    // Incident Shift Select Change
    document
        .getElementById("incidentShiftSelect")
        ?.addEventListener("change", handleIncidentShiftChange);
    document
        .getElementById("btnSubmitIncident")
        ?.addEventListener("click", handleSubmitIncident);

    // Preview Sheet Tabs
    document.querySelectorAll(".p-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll(".p-tab-btn")
                .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderPreviewSheet(btn.getAttribute("data-sheet"));
        });
    });

    // Copy for Google Sheets
    document
        .getElementById("btnCopyForGSheets")
        ?.addEventListener("click", copyCurrentPreviewTable);

    // Protocols Sub-tabs
    document.querySelectorAll(".p-nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document
                .querySelectorAll(".p-nav-btn")
                .forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            renderProtocolSection(btn.getAttribute("data-sec"));
        });
    });

    // Ca-Live & POS Event Listeners
    document
        .getElementById("liveShiftSelect")
        ?.addEventListener("change", (e) => {
            loadLiveShiftDetailsAndCandidates(e.target.value);
        });

    document
        .getElementById("btnClearLiveCart")
        ?.addEventListener("click", () => {
            liveCart = {};
            renderLiveCart();
        });

    document
        .getElementById("btnCheckoutLivePOS")
        ?.addEventListener("click", handleCheckoutLivePOS);

    // Hỗ trợ phím tắt Enter tại tab 'Ca-Live' để xác nhận thanh toán nhanh chóng
    document.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            const liveTab = document.getElementById("tab-live-shift");
            if (liveTab && liveTab.classList.contains("active")) {
                const keys = Object.keys(liveCart || {});
                if (keys.length > 0) {
                    e.preventDefault();
                    handleCheckoutLivePOS();
                }
            }
        }
    });

    document.getElementById("btnPOSQuickAdd")?.addEventListener("click", () => {
        const prodId = document.getElementById("livePOSQuickSelect")?.value;
        if (!prodId) {
            alert(
                "Vui lòng chọn 1 sản phẩm từ danh sách để thêm vào giỏ hàng!",
            );
            return;
        }
        addToLiveCart(prodId);
    });

    document
        .getElementById("btnToggleLiveHeader")
        ?.addEventListener("click", () => {
            const body = document.getElementById("liveHeaderBody");
            const icon = document.getElementById("iconToggleLiveHeader");
            const txt = document.getElementById("textToggleLiveHeader");
            if (!body) return;
            const isHidden = body.style.display === "none";
            body.style.display = isHidden ? "flex" : "none";
            if (icon)
                icon.className = isHidden
                    ? "fa-solid fa-chevron-up"
                    : "fa-solid fa-chevron-down";
            if (txt) txt.textContent = isHidden ? "Thu gọn" : "Mở rộng";
        });

    document
        .getElementById("btnLiveOpenIncidentModal")
        ?.addEventListener("click", () => {
            const sel = document.getElementById("liveShiftSelect");
            if (sel && sel.value) {
                switchToTab("tab-contingency");
                const incSel = document.getElementById("incidentShiftSelect");
                if (incSel) {
                    incSel.value = sel.value;
                    handleIncidentShiftChange();
                }
            }
        });

    // Upload Product Catalog Excel Event Listeners
    document
        .getElementById("btnUploadInventoryExcel")
        ?.addEventListener("click", () => {
            document.getElementById("inputInventoryExcelFile")?.click();
        });
    document
        .getElementById("inputInventoryExcelFile")
        ?.addEventListener("change", handleUploadInventoryExcel);

    // Export Contingency Incident Excel
    document
        .getElementById("btnExportIncidentExcel")
        ?.addEventListener("click", () => {
            window.open("/api/contingency/export-excel", "_blank");
        });

    // KPI Event Listeners
    document
        .getElementById("kpiShiftSearchInput")
        ?.addEventListener("input", renderKpiAttendance);
    document
        .getElementById("kpiMemberSearchInput")
        ?.addEventListener("input", renderKpiLeaderboard);
    document
        .getElementById("btnResetKpiAttendance")
        ?.addEventListener("click", async () => {
            if (currentUserRole !== "admin") {
                openAdminLoginModal(
                    "Bạn cần đăng nhập quyền Quản trị viên để đặt lại trạng thái điểm danh!",
                );
                return;
            }
            openConfirmModal({
                title: "Xác Nhận Đặt Lại Điểm Danh",
                message:
                    "Bạn có chắc chắn muốn đặt lại trạng thái điểm danh của tất cả thành viên về mặc định (Đúng giờ)?",
                confirmBtnText: "Đặt Lại Toàn Bộ",
                onConfirm: async () => {
                    try {
                        const res = await authFetch(
                            "/api/kpi/attendance/reset",
                            { method: "POST" },
                        ).then((r) => r.json());
                        if (res.success) {
                            globalKpiAttendance = res.attendance || [];
                            renderKpiAll();
                        }
                    } catch (e) {
                        console.error("Error resetting KPI attendance:", e);
                    }
                },
            });
        });
    document
        .getElementById("btnExportKpiReport")
        ?.addEventListener("click", () => {
            exportKpiReportCSV();
        });

    startLiveClock();
}

function updateCaNgoaiPanelState(enabled) {
    const grid = document.getElementById("outsideShiftsGrid");
    if (!grid) return;

    if (enabled) {
        grid.classList.remove("disabled-panel");
        document
            .querySelectorAll(
                "#formAddCaNgoai input, #formAddCaNgoai select, #formAddCaNgoai button, #btnClearAllCaNgoai",
            )
            .forEach((el) => {
                el.disabled = false;
            });
    } else {
        grid.classList.add("disabled-panel");
        document
            .querySelectorAll(
                "#formAddCaNgoai input, #formAddCaNgoai select, #formAddCaNgoai button, #btnClearAllCaNgoai",
            )
            .forEach((el) => {
                el.disabled = true;
            });
    }
}

// Load Initial Schedule
async function loadCurrentSchedule() {
    try {
        const [resSched, resShifts, resMembers] = await Promise.all([
            fetch("/api/schedule/current").then((r) => r.json()),
            fetch("/api/shifts").then((r) => r.json()),
            fetch("/api/members").then((r) => r.json()),
        ]);

        if (resShifts.success) globalShifts = resShifts.shifts;
        if (resMembers.success) globalMembers = resMembers.members;

        if (resSched.success) {
            globalScheduleData = resSched.result;
            if (globalScheduleData && globalScheduleData.start_date) {
                const dateInp = document.getElementById("cfgStartDate");
                if (dateInp) dateInp.value = globalScheduleData.start_date;
            }
            populateUI();
        }
    } catch (err) {
        console.error("Error loading schedule:", err);
    }
}

// Load Ca Ngoài List
async function loadCaNgoaiList() {
    try {
        const res = await fetch("/api/ca-ngoai");
        const data = await res.json();
        if (data.success) {
            globalCaNgoai = data.list || [];
            const masterCb = document.getElementById("chkMasterNgoai");
            if (masterCb) {
                masterCb.checked = data.enabled;
                updateCaNgoaiPanelState(data.enabled);
            }
            renderCaNgoaiTable();
        }
    } catch (e) {
        console.error("Error loading ca ngoai:", e);
    }
}

// Render Ca Ngoài Table
function renderCaNgoaiTable() {
    const tbody = document.getElementById("caNgoaiTableBody");
    if (!tbody) return;

    if (!globalCaNgoai.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Chưa có ca bán ngoài nào. Thêm từ bảng bên trái.</td></tr>`;
        return;
    }

    let html = "";
    globalCaNgoai.forEach((item, idx) => {
        html += `
            <tr>
                <td class="cell-center mk-num">${idx + 1}</td>
                <td><strong>${item.name}</strong></td>
                <td class="cell-center">${item.day}</td>
                <td class="cell-center mk-num">${item.start_time}</td>
                <td class="cell-center mk-num">${item.end_time}</td>
                <td class="cell-center mk-lead">${item.chinh}</td>
                <td class="cell-center mk-dp">${item.dp}</td>
                <td class="cell-center">
                    <button class="btn-delete-row" onclick="deleteCaNgoaiItem('${item.id}')">
                        <i class="fa-solid fa-trash-can"></i> Xóa
                    </button>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

window.deleteCaNgoaiItem = async function (id) {
    const res = await fetch("/api/ca-ngoai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id: id }),
    });
    const data = await res.json();
    if (data.success) {
        globalCaNgoai = data.list;
        renderCaNgoaiTable();
    }
};

// ---------------------------------------------------------------------------
// Trạng thái chờ giải.
// Solve mất 15–25s ở máy này, lâu hơn trên Render. Chỉ một cái spinner thì
// người dùng tưởng treo và bấm lại → gửi thêm một lượt solve nữa.
// Ba bước dưới đây là ba bước quan sát được thật; server không báo tiến độ
// giữa chừng nên không bịa ra các mốc bên trong bộ giải.
// ---------------------------------------------------------------------------
const solveUI = {
    timer: null,
    start: 0,

    step(n, state) {
        const el = document.querySelector(`.solve-step[data-step="${n}"]`);
        if (!el) return;
        el.classList.remove("busy", "done");
        if (state) el.classList.add(state);
        const icon =
            state === "done"
                ? "fa-solid fa-check"
                : state === "busy"
                  ? "fa-solid fa-circle-notch fa-spin"
                  : "fa-regular fa-circle";
        el.querySelector("i").className = icon;
    },

    open() {
        const overlay = document.getElementById("solveOverlay");
        if (!overlay) return;
        this.start = Date.now();
        [1, 2, 3].forEach((n) => this.step(n, null));
        this.step(1, "busy");
        overlay.classList.add("active");

        const out = document.getElementById("solveElapsed");
        this.timer = setInterval(() => {
            if (out)
                out.textContent = Math.round((Date.now() - this.start) / 1000);
        }, 500);
    },

    close() {
        clearInterval(this.timer);
        this.timer = null;
        document.getElementById("solveOverlay")?.classList.remove("active");
    },

    seconds() {
        return Math.round((Date.now() - this.start) / 1000);
    },
};

// Run Optimizer API
async function runOptimizerWithParams(params) {
    const btn = document.getElementById("btnRunOptimizer");
    const quickBtn = document.getElementById("btnQuickOptimize");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML =
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang giải bài toán tối ưu với OR-Tools...';
    }
    if (quickBtn) quickBtn.disabled = true;
    solveUI.open();

    try {
        const isNgoaiEnabled = document.getElementById("chkMasterNgoai")
            ? document.getElementById("chkMasterNgoai").checked
            : true;
        const payload = {
            ...params,
            enable_ca_ngoai: isNgoaiEnabled,
            custom_ca_ngoai: globalCaNgoai,
        };
        const req = authFetch("/api/schedule/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        solveUI.step(1, "done");
        solveUI.step(2, "busy");

        const res = await req;
        const data = await res.json();
        solveUI.step(2, "done");
        solveUI.step(3, "busy");

        if (data.success) {
            globalScheduleData = data.result;
            populateUI();
            solveUI.step(3, "done");
            // Không alert khi thành công: bảng phân ca cập nhật tại chỗ và dải
            // trên đầu bảng đã nói rõ còn thiếu ai hay đủ cả. Một hộp thoại
            // nữa chỉ bắt bấm thêm một lần.
            switchToTab("tab-schedule");
        } else {
            alert(
                "Không giải được bài toán: " + (data.message || "lỗi không rõ"),
            );
        }
    } catch (e) {
        alert(
            "Mất kết nối tới server sau " +
                solveUI.seconds() +
                " giây: " +
                e.message,
        );
    } finally {
        solveUI.close();
        if (btn) {
            btn.disabled = false;
            btn.innerHTML =
                '<i class="fa-solid fa-play"></i> Thực Thi Thuật Toán Phân Ca Tối Ưu (Google OR-Tools CP-SAT)';
        }
        if (quickBtn) quickBtn.disabled = false;
    }
}

// Chuyển tab bằng cách bấm hộ vào nav item — dùng lại đúng một đường đi của
// initTabs() thay vì tự bật/tắt class ở nơi thứ hai.
function switchToTab(tabId) {
    document.querySelector(`.nav-menu .nav-item[data-tab="${tabId}"]`)?.click();
}

function populateUI() {
    if (!globalScheduleData) return;

    renderDutyBoard();
    renderKPIs();
    renderMemberTable();
    renderAuditResults();
    loadProtocols();
    loadHeatmapData();
    populateIncidentShiftDropdown();
    populateLiveShiftDropdown();
}

// ---------------------------------------------------------------------------
// BẢNG PHÂN CA
// Trước đây 39 ca đổ ra 39 card giống nhau, phải cuộn hết mới biết ca nào
// thiếu người. Nay là lưới ngày × khung giờ: ô thiếu người hiện thành dòng kẻ
// trống chờ điền tên, thấy ngay từ xa. Trên điện thoại lưới 7 cột không đọc
// được, nên cùng dữ liệu đó render thành agenda theo ngày.
// ---------------------------------------------------------------------------

const BOARD_DAYS = [
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
    "Chủ Nhật",
];
const DAY_ABBR = {
    "Thứ 2": "T2",
    "Thứ 3": "T3",
    "Thứ 4": "T4",
    "Thứ 5": "T5",
    "Thứ 6": "T6",
    "Thứ 7": "T7",
    "Chủ Nhật": "CN",
};
const BOARD_SLOTS = [
    "7h - 9h",
    "9h - 11h",
    "11h - 13h",
    "13h - 15h",
    "15h - 17h",
];
const NGOAI_ROW = "__ngoai__";

let agendaDay = null;

function esc(str) {
    return String(str ?? "").replace(
        /[&<>"']/g,
        (c) =>
            ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
            })[c],
    );
}

// Ca bán ngoài có giờ tự đặt ('17:00 - 19:30') nên không khớp 5 khung chuẩn.
// Chúng đi vào hàng "điểm bán ngoài" ở dưới cùng.
function boardRowOf(shift) {
    return BOARD_SLOTS.includes(shift.slot) && shift.type === "Phong"
        ? shift.slot
        : NGOAI_ROW;
}

function getFilteredShifts() {
    const channelFilter =
        document
            .querySelector("#channelFilter .filter-btn.active")
            ?.getAttribute("data-filter") || "all";
    const dayFilter = document.getElementById("dayFilter")?.value || "all";
    const searchQuery = (
        document.getElementById("memberSearchInput")?.value || ""
    )
        .toLowerCase()
        .trim();

    return (globalScheduleData?.assigned_shifts || []).filter((s) => {
        if (channelFilter !== "all" && s.type !== channelFilter) return false;
        if (dayFilter !== "all" && s.day !== dayFilter) return false;
        if (searchQuery) {
            const hit =
                s.shift_id.toLowerCase().includes(searchQuery) ||
                s.location.toLowerCase().includes(searchQuery) ||
                s.assigned_members.some(
                    (m) =>
                        m.name.toLowerCase().includes(searchQuery) ||
                        m.department.toLowerCase().includes(searchQuery) ||
                        m.phone.includes(searchQuery),
                );
            if (!hit) return false;
        }
        return true;
    });
}

function shiftGap(s) {
    return Math.max(0, (s.required_count || 0) - (s.assigned_count || 0));
}

function renderDutyBoard() {
    const container = document.getElementById("scheduleGrid");
    if (!container || !globalScheduleData) return;

    const filtered = getFilteredShifts();

    if (filtered.length === 0) {
        container.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-folder-open"></i> Không có ca trực nào khớp bộ lọc.</div>`;
        return;
    }

    // Gom theo hàng (khung giờ) × cột (ngày), và lấy ngày dương lịch cho tiêu đề
    const buckets = {};
    const dateOfDay = {};
    filtered.forEach((s) => {
        const key = boardRowOf(s) + "|" + s.day;
        (buckets[key] = buckets[key] || []).push(s);
        if (s.type === "Phong" && s.date && !dateOfDay[s.day])
            dateOfDay[s.day] = s.date;
    });

    const rows = BOARD_SLOTS.filter((sl) =>
        BOARD_DAYS.some((d) => buckets[sl + "|" + d]),
    );
    if (filtered.some((s) => boardRowOf(s) === NGOAI_ROW)) rows.push(NGOAI_ROW);

    const totalGap = filtered.reduce((n, s) => n + shiftGap(s), 0);
    const shortShifts = filtered.filter((s) => shiftGap(s) > 0);

    container.innerHTML = [
        renderAlertStrip(filtered, shortShifts, totalGap),
        renderBoardGrid(rows, buckets, dateOfDay),
        renderAgenda(filtered, shortShifts),
    ].join("");
}

function getMemberShiftCounts() {
    const counts = {};
    if (!globalScheduleData || !globalScheduleData.assigned_shifts)
        return counts;
    globalScheduleData.assigned_shifts.forEach((s) => {
        (s.assigned_members || []).forEach((m) => {
            // Cảnh báo vi phạm số ca không tính những ca dự phòng (chỉ tính ca trực chính)
            if (m.name && m.role === "Chính") {
                counts[m.name] = (counts[m.name] || 0) + 1;
            }
        });
    });
    return counts;
}

function getMaxShiftsLimit() {
    if (
        globalScheduleData &&
        globalScheduleData.config &&
        globalScheduleData.config.max_shifts_per_member
    ) {
        return parseInt(globalScheduleData.config.max_shifts_per_member, 10);
    }
    const el = document.getElementById("cfgMaxShifts");
    return el ? parseInt(el.value, 10) || 4 : 4;
}

function renderAlertStrip(filtered, shortShifts, totalGap) {
    const shiftCounts = getMemberShiftCounts();
    const maxShifts = getMaxShiftsLimit();
    const overlimitMembers = Object.keys(shiftCounts).filter(
        (name) => shiftCounts[name] > maxShifts,
    );

    let overlimitBanner = "";
    if (overlimitMembers.length > 0) {
        overlimitBanner = `<div class="alert-strip danger-overlimit" style="margin-bottom: 8px; background: rgba(220, 38, 38, 0.18); border: 1px solid var(--cinnabar); color: #FCA5A5; padding: 10px 14px; border-radius: var(--radius-sm); display: flex; align-items: center; gap: 10px; font-size: 13px;">
            <i class="fa-solid fa-triangle-exclamation" style="color: var(--cinnabar); font-size: 16px;"></i>
            <span><strong>CẢNH BÁO VI PHẠM SỐ CA:</strong> Có <b>${overlimitMembers.length}</b> cá nhân bị xếp quá số ca tối đa (${maxShifts} ca/người): <b>${overlimitMembers.map((n) => `${esc(n)} (${shiftCounts[n]}/${maxShifts} ca)`).join(", ")}</b> — <span style="color: #FF8080; font-weight: 700;">Highlight đỏ trực tiếp trên lịch</span></span>
        </div>`;
    }

    let statusStrip = "";
    if (totalGap === 0) {
        statusStrip = `<div class="alert-strip ok">
                    <i class="fa-solid fa-circle-check"></i>
                    <span>Đủ người cả <b>${filtered.length}</b> ca. Bảng phân công đã hoàn chỉnh.</span>
                </div>`;
    } else {
        const names = shortShifts
            .slice(0, 4)
            .map((s) => `${esc(DAY_ABBR[s.day] || s.day)} ${esc(s.slot)}`)
            .join(" · ");
        const more =
            shortShifts.length > 4 ? ` +${shortShifts.length - 4} ca nữa` : "";
        statusStrip = `<div class="alert-strip warn">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <span>Thiếu <b>${totalGap}</b> người ở <b>${shortShifts.length}</b> ca: ${names}${more}</span>
                </div>`;
    }

    return overlimitBanner + statusStrip;
}

function renderBoardGrid(rows, buckets, dateOfDay) {
    let cells = `<div class="board-corner">Giờ</div>`;
    BOARD_DAYS.forEach((d) => {
        cells += `<div class="board-daylabel">${esc(DAY_ABBR[d])}
                    ${dateOfDay[d] ? `<small>${esc(dateOfDay[d])}</small>` : ""}
                  </div>`;
    });

    rows.forEach((row) => {
        cells +=
            row === NGOAI_ROW
                ? `<div class="board-slotlabel"><b>Ngoài</b>điểm bán</div>`
                : `<div class="board-slotlabel"><b>${esc(row.split(" - ")[0])}</b>–${esc(row.split(" - ")[1])}</div>`;

        BOARD_DAYS.forEach((day) => {
            const list = buckets[row + "|" + day];
            if (!list || !list.length) {
                cells += `<div class="cell cell-none" aria-hidden="true"></div>`;
                return;
            }
            const short = list.some((s) => shiftGap(s) > 0);
            cells += `<div class="cell ${short ? "cell-short" : ""}">
                        ${list.map(renderShiftSlip).join("")}
                      </div>`;
        });
    });

    return `<div class="board">
                <div class="board-top">
                    <h3>Bảng phân công tuần</h3>
                    <span class="board-meta">Bấm vào ca để sửa nhân sự</span>
                </div>
                <div class="board-scroll">
                    <div class="duty-board" style="grid-template-rows: auto repeat(${rows.length}, minmax(92px, auto))">
                        ${cells}
                    </div>
                </div>
                <div class="board-legend">
                    <span class="lg-filled"><i></i> đã phân công</span>
                    <span class="lg-dp"><i></i> dự phòng</span>
                    <span class="lg-blank"><i></i> chưa có người</span>
                    <span class="lg-lead"><i class="fa-solid fa-star"></i> trưởng ca</span>
                    <span style="display:inline-flex; align-items:center; gap:5px; color:#FF8080; font-size:12px; font-weight:600;"><i class="fa-solid fa-triangle-exclamation" style="color:var(--cinnabar);"></i> vượt ca max</span>
                </div>
            </div>`;
}

// Một "phiếu ca" trong ô lưới. Mỗi suất cần người là một dòng kẻ:
// có tên thì kẻ đậm, dự phòng thì kẻ chấm, chưa ai thì kẻ đỏ son bỏ trống.
function renderShiftSlip(s) {
    const gap = shiftGap(s);
    const members = s.assigned_members || [];
    const chinh = members.filter((m) => m.role === "Chính");
    const dp = members.filter((m) => m.role !== "Chính");

    const shiftCounts = getMemberShiftCounts();
    const maxShifts = getMaxShiftsLimit();

    let hasOverlimit = false;
    let lines = "";
    chinh.concat(dp).forEach((m) => {
        const isLeader = s.shift_leader === m.name;
        const isDp = m.role !== "Chính";
        const totalCount = shiftCounts[m.name] || 0;
        const isOver = totalCount > maxShifts;
        if (isOver) hasOverlimit = true;

        const overClass = isOver ? "line-overlimit" : "";
        const titleText = `${esc(m.name)} — ${esc(m.department)} (${totalCount}/${maxShifts} ca)${isOver ? " [⚠️ VƯỢT QUÁ SO CA TOI DA]" : ""} — Nhiệm vụ: ${esc(m.task || "Bán hàng F&B")}`;

        lines += `<span class="assign-line ${isDp ? "line-dp" : "line-filled"} ${overClass}" title="${titleText}">
                    <span class="assign-name">${esc(m.name)}${isOver ? " ⚠️" : ""}</span>
                    ${isLeader ? '<i class="lead-mark fa-solid fa-star" title="Trưởng ca"></i>' : ""}
                  </span>`;
    });
    for (let i = 0; i < gap; i++)
        lines += `<span class="assign-line line-blank"></span>`;

    return `<button type="button" class="shift-slip ${hasOverlimit ? "has-overlimit-shift" : ""}" onclick="openShiftEditModal('${esc(s.shift_id)}')"
                    title="${esc(s.shift_id)} — ${esc(s.location)} (${esc(s.slot)})">
                <span class="cell-top">
                    <span class="cell-code">${esc(s.shift_id)} ${hasOverlimit ? "🚨" : ""}</span>
                    <span class="cell-count">${s.assigned_count}/${s.required_count}</span>
                </span>
                <span class="assign-lines">${lines}</span>
            </button>`;
}

// --- Biến thể điện thoại: chọn ngày rồi cuộn dọc theo khung giờ -------------
function renderAgenda(filtered, shortShifts) {
    const daysPresent = BOARD_DAYS.filter((d) =>
        filtered.some((s) => s.day === d),
    );
    if (!daysPresent.length) return "";

    const gapDays = new Set(shortShifts.map((s) => s.day));
    if (!agendaDay || !daysPresent.includes(agendaDay)) {
        agendaDay = daysPresent.find((d) => gapDays.has(d)) || daysPresent[0];
    }

    const strip = daysPresent
        .map((d) => {
            const dayShifts = filtered.filter((s) => s.day === d);
            const dayGap = dayShifts.reduce((n, s) => n + shiftGap(s), 0);
            return `<button type="button" class="agenda-day ${d === agendaDay ? "active" : ""} ${dayGap ? "has-gap" : ""}"
                        onclick="selectAgendaDay('${esc(d)}')">
                    ${esc(DAY_ABBR[d])}
                    <small>${dayGap ? "thiếu " + dayGap : dayShifts.length + " ca"}</small>
                </button>`;
        })
        .join("");

    const minutesOf = (t) => {
        const [h, m] = String(t || "0:00")
            .split(":")
            .map(Number);
        return (h || 0) * 60 + (m || 0);
    };
    const ofDay = filtered
        .filter((s) => s.day === agendaDay)
        .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time));

    const shiftCounts = getMemberShiftCounts();
    const maxShifts = getMaxShiftsLimit();

    const list = ofDay
        .map((s) => {
            const gap = shiftGap(s);
            const members = s.assigned_members || [];
            const chinh = members.filter((m) => m.role === "Chính");
            const dp = members.filter((m) => m.role !== "Chính");

            let people = chinh
                .concat(dp)
                .map((m) => {
                    const isLeader = s.shift_leader === m.name;
                    const isDp = m.role !== "Chính";
                    const totalCount = shiftCounts[m.name] || 0;
                    const isOver = totalCount > maxShifts;

                    return `<span class="agenda-person ${isDp ? "dp" : ""} ${isLeader ? "lead" : ""} ${isOver ? "overlimit" : ""}">
                        <span class="dot"></span>
                        <span>${esc(m.name)}</span>
                        ${isOver ? `<span class="tag overlimit-tag" style="background:#991B1B; color:#FFF; font-weight:700;">⚠️ ${totalCount}/${maxShifts} ca</span>` : `<span class="tag">${isLeader ? "Trưởng ca" : isDp ? "Dự phòng" : esc(m.department.replace("Ban ", ""))}</span>`}
                    </span>`;
                })
                .join("");
            for (let i = 0; i < gap; i++) {
                people += `<span class="agenda-gap"><i class="fa-solid fa-user-plus"></i> Còn trống một suất</span>`;
            }

            return `<button type="button" class="agenda-shift ${gap ? "is-short" : ""}"
                        onclick="openShiftEditModal('${esc(s.shift_id)}')">
                    <span class="agenda-shift-head">
                        <strong>${esc(s.slot)}</strong>
                        <span>${esc(s.location)}<br>${esc(s.shift_id)} · ${s.assigned_count}/${s.required_count} người</span>
                    </span>
                    <span class="agenda-roster">${people}</span>
                </button>`;
        })
        .join("");

    return `<div class="agenda">
                <div class="agenda-days">${strip}</div>
                <div class="agenda-list">${list}</div>
            </div>`;
}

window.selectAgendaDay = function (day) {
    agendaDay = day;
    renderDutyBoard();
};

// Open Shift Edit Modal
window.openShiftEditModal = function (shiftId) {
    if (!globalScheduleData) return;
    const s = globalScheduleData.assigned_shifts.find(
        (item) => item.shift_id === shiftId,
    );
    if (!s) return;

    currentEditingShift = s;
    const modal = document.getElementById("shiftEditModal");
    document.getElementById("modalShiftTitle").innerHTML =
        `<i class="fa-solid fa-pen-to-square"></i> Chi Tiết & Chỉnh Sửa Ca ${esc(s.shift_id)} (${esc(s.day)} - ${esc(s.slot)})`;

    let leaderOptions = "";
    s.assigned_members.forEach((m) => {
        const sel = s.shift_leader === m.name ? "selected" : "";
        leaderOptions += `<option value="${esc(m.name)}" ${sel}>⭐ ${esc(m.name)} (${esc(m.department)} - ${esc(m.role)})</option>`;
    });

    const shiftLocation =
        s.location ||
        (s.type === "Ngoai" ? "Điểm Bán Ngoài Ca" : "Phòng Thanh Niên");

    let membersListHtml = "";
    s.assigned_members.forEach((m, idx) => {
        const isDp = m.role !== "Chính";
        const defaultRole = isDp
            ? "⚡ Dự bị tiếp ứng & Hỗ trợ"
            : idx === 0
              ? "💵 Thu ngân / Nhập sheet"
              : idx === 1
                ? "📦 Kiểm kê hàng"
                : "🛵 Phục vụ / Giao hàng";
        const posRole = m.position_role || defaultRole;

        membersListHtml += `
            <div class="member-edit-row ${isDp ? "is-dp-row" : ""}">
                <div class="mer-who">
                    <div class="mer-name-line">
                        <span class="mer-index">#${idx + 1}</span>
                        <strong>${esc(m.name)}</strong>
                        <span class="mer-dept-pill">${esc((m.department || "").replace("Ban ", ""))}</span>
                        ${s.shift_leader === m.name ? '<span class="mer-lead-badge"><i class="fa-solid fa-star"></i> Trưởng ca</span>' : ""}
                    </div>
                    <div class="mer-meta">
                        <span><i class="fa-solid fa-phone"></i> ${esc(m.phone)}</span>
                        <span>&bull;</span>
                        <span><i class="fa-solid fa-motorcycle"></i> ${esc(m.vehicle || "Không xe")}</span>
                    </div>
                </div>
                <div class="mer-controls">
                    <div class="mer-ctrl-item">
                        <span class="mer-ctrl-lbl">Vai trò</span>
                        <select class="custom-select member-role-select" data-member-id="${m.member_id}" onchange="handleRoleChangeInModal(this, '${m.member_id}')">
                            <option value="Chính" ${!isDp ? "selected" : ""}>Trực chính</option>
                            <option value="Dự phòng" ${isDp ? "selected" : ""}>Dự phòng</option>
                        </select>
                    </div>
                    <div class="mer-ctrl-item">
                        <span class="mer-ctrl-lbl">Nhiệm vụ cụ thể</span>
                        <select class="custom-select member-position-select" data-member-id="${m.member_id}" id="pos_sel_${m.member_id}">
                            <option value="🛵 Phục vụ / Giao hàng" ${posRole.includes("Phục vụ") ? "selected" : ""}>🛵 Phục vụ / Giao hàng</option>
                            <option value="💵 Thu ngân / Nhập sheet" ${posRole.includes("Thu ngân") ? "selected" : ""}>💵 Thu ngân / Nhập sheet</option>
                            <option value="📦 Kiểm kê hàng" ${posRole.includes("Kiểm kê") ? "selected" : ""}>📦 Kiểm kê hàng</option>
                            <option value="⚡ Dự bị tiếp ứng & Hỗ trợ" ${posRole.includes("Dự bị") ? "selected" : ""}>⚡ Dự bị tiếp ứng & Hỗ trợ</option>
                            <option value="🥤 Pha chế & Chuẩn bị" ${posRole.includes("Pha chế") ? "selected" : ""}>🥤 Pha chế & Chuẩn bị</option>
                            <option value="📣 Tiếp thị & Chào khách" ${posRole.includes("Tiếp thị") ? "selected" : ""}>📣 Tiếp thị & Chào khách</option>
                        </select>
                    </div>
                </div>
            </div>
        `;
    });

    const bodyHtml = `
        <div class="shift-modal-summary-banner">
            <div class="sms-loc"><i class="fa-solid fa-location-dot"></i> <strong>${esc(shiftLocation)}</strong> &bull; <span class="sms-time">${esc(s.day)} (${esc(s.slot)})</span></div>
            <div class="sms-meta">Loại ca: <b>${esc(s.type_label)}</b> &bull; Quy mô: <b>${s.assigned_count}/${s.required_count} người</b></div>
        </div>

        <div class="form-group mb-16">
            <label><i class="fa-solid fa-star text-gold"></i> <strong>Chỉ định Trưởng ca (Ca trưởng):</strong></label>
            <select id="modalSelectLeader" class="custom-select">${leaderOptions}</select>
        </div>
        <div class="form-group">
            <label><i class="fa-solid fa-users"></i> <strong>Phân công vị trí & nhiệm vụ (${s.assigned_count} người trong ca):</strong></label>
            <div class="member-edit-list" style="max-height: 290px; overflow-y: auto;">
                ${membersListHtml}
            </div>
        </div>
        <div id="modalShiftStatusMsg" class="swap-msg" style="margin-top: 10px;"></div>
    `;

    document.getElementById("modalShiftBody").innerHTML = bodyHtml;
    modal.classList.add("active");
};

window.handleRoleChangeInModal = function (roleSelect, memberId) {
    const posSelect = document.getElementById(`pos_sel_${memberId}`);
    if (roleSelect.value === "Dự phòng" && posSelect) {
        posSelect.value = "⚡ Dự bị tiếp ứng & Hỗ trợ";
    } else if (
        roleSelect.value === "Chính" &&
        posSelect &&
        posSelect.value === "⚡ Dự bị tiếp ứng & Hỗ trợ"
    ) {
        posSelect.value = "🛵 Phục vụ / Giao hàng";
    }
};

async function handleSaveShiftEdit() {
    if (!currentEditingShift) return;

    const newLeader = document.getElementById("modalSelectLeader")?.value;
    const memberUpdates = [];
    const msg = document.getElementById("modalShiftStatusMsg");

    const roleMap = new Map();
    document.querySelectorAll(".member-role-select").forEach((sel) => {
        roleMap.set(sel.getAttribute("data-member-id"), sel.value);
    });

    document.querySelectorAll(".member-position-select").forEach((sel) => {
        const memId = sel.getAttribute("data-member-id");
        memberUpdates.push({
            member_id: memId,
            role: roleMap.get(memId) || "Chính",
            position_role: sel.value,
        });
    });

    try {
        const res = await authFetch("/api/shift/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shift_id: currentEditingShift.shift_id,
                shift_leader: newLeader,
                assigned_members: memberUpdates,
            }),
        });
        const data = await res.json();
        if (data.success) {
            const idx = globalScheduleData.assigned_shifts.findIndex(
                (s) => s.shift_id === currentEditingShift.shift_id,
            );
            if (idx !== -1)
                globalScheduleData.assigned_shifts[idx] = data.shift;

            renderDutyBoard();
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent =
                    "✓ Đã cập nhật Trưởng ca và phân công nhiệm vụ thành công!";
            }
            setTimeout(() => {
                document
                    .getElementById("shiftEditModal")
                    ?.classList.remove("active");
            }, 600);
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message || "Lỗi cập nhật";
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi cập nhật: " + e.message;
        }
    }
}

// Heatmap Data Loading & Rendering
async function loadHeatmapData() {
    try {
        const res = await fetch("/api/heatmap");
        const data = await res.json();
        if (data.success) {
            renderHeatmapTable(data.heatmap);
        }
    } catch (e) {
        console.error("Error loading heatmap:", e);
    }
}

function renderHeatmapTable(heatmapData) {
    const container = document.getElementById("heatmapContainer");
    if (!container || !heatmapData) return;

    const slots = heatmapData.slots;
    const matrix = heatmapData.matrix;

    let tableHtml = `
        <table class="heatmap-table">
            <thead>
                <tr>
                    <th class="heat-day-col">Thứ / Khung Giờ</th>
                    ${slots.map((s) => `<th>${s}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
    `;

    matrix.forEach((row) => {
        tableHtml += `<tr><td>${row.day}</td>`;
        row.slots.forEach((cell) => {
            const memberNames =
                cell.free_members
                    .slice(0, 10)
                    .map((m) => m.name)
                    .join(", ") + (cell.free_members.length > 10 ? "..." : "");
            tableHtml += `
                <td class="lvl-${cell.level}" title="${row.day} (${cell.slot}): ${cell.count} thành viên rảnh\n${memberNames}">
                    <div class="heat-cell-val">${cell.count}</div>
                    <div class="heat-cell-pct">${cell.percentage}% TV rảnh</div>
                </td>
            `;
        });
        tableHtml += `</tr>`;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;
}

// KPI Rendering
function renderKPIs() {
    const summary = globalScheduleData.summary || {};
    const audit = globalScheduleData.audit_results || {};

    document.getElementById("kpiTotalMembers").textContent =
        summary.total_members || 50;
    document.getElementById("kpiTotalShifts").textContent =
        summary.total_active_shifts || 70;
    document.getElementById("kpiAvgShifts").textContent = (
        summary.avg_shifts_per_member || 3.9
    ).toFixed(1);
    document.getElementById("kpiFairness").textContent =
        `${audit.fairness_metrics?.fairness_score || 97}%`;
}

// Member Workload Table
function renderMemberTable() {
    const tbody = document.getElementById("memberTableBody");
    if (!tbody || !globalScheduleData) return;

    const stats = globalScheduleData.member_stats || [];
    const searchInp = document.getElementById("memberStatsSearchInput");
    const query = searchInp ? searchInp.value.toLowerCase().trim() : "";

    let html = "";
    stats.forEach((m) => {
        // Filter by query if present
        if (query) {
            const nameMatch = (m.name || "").toLowerCase().includes(query);
            const deptMatch = (m.department || "")
                .toLowerCase()
                .includes(query);
            const phoneMatch = (m.phone || "").toLowerCase().includes(query);
            const idMatch = (m.member_id || "").toLowerCase().includes(query);
            const jobMatch = (m.job || "").toLowerCase().includes(query);
            if (
                !nameMatch &&
                !deptMatch &&
                !phoneMatch &&
                !idMatch &&
                !jobMatch
            ) {
                return; // Skip this member
            }
        }

        const standbyBadge = m.is_standby
            ? `<span class="mk-ok"><i class="fa-solid fa-circle-check"></i> Có</span>`
            : `<span class="mk-none">Không</span>`;

        html += `
            <tr>
                <td><strong>${m.member_id}</strong></td>
                <td><strong>${m.name}</strong></td>
                <td>${m.department}</td>
                <td>${m.job}</td>
                <td class="mk-num">${m.phone}</td>
                <td>${standbyBadge}</td>
                <td><span class="mk-num">${m.total_shifts}</span></td>
                <td class="mk-num">${m.total_hours}h</td>
                <td class="mk-num">${m.phong_shifts}</td>
                <td class="mk-num">${m.ngoai_shifts}</td>
                <td><span class="mk-lead">${m.committed_matched}</span></td>
                <td class="cell-center">
                    ${
                        currentUserRole === "admin"
                            ? `
                        <button type="button" class="btn-action-sm" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.2); padding: 3px 8px; font-size: 11px;" onclick="openEditMemberModal('${m.member_id}')" title="Sửa lịch rảnh / thông tin">
                            <i class="fa-solid fa-user-gear"></i> Chỉnh sửa
                        </button>
                    `
                            : `
                        <span style="color: var(--ink-dim); font-size: 11px;">Chỉ xem</span>
                    `
                    }
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

// Audit Results Rendering
function renderAuditResults() {
    const audit = globalScheduleData.audit_results || {};
    const grid = document.getElementById("auditChecklistGrid");
    if (!grid) return;

    const items = [
        {
            title: "Chống Xung Đột Trùng Ca (Ca Trong vs Ca Ngoài)",
            desc: `Đã kiểm tra ${globalScheduleData.assigned_shifts?.length} ca trực. Phát hiện: ${audit.conflict_count} vi phạm.`,
            passed: audit.conflict_count === 0,
        },
        {
            title: "Tuân Thủ Lịch Rảnh Cá Nhân Đã Đăng Ký",
            desc: `100% thành viên chỉ được phân bổ vào các khung giờ đã đăng ký rảnh (kể cả ca ngoài lệch khung giờ). Phát hiện: ${audit.availability_violation_count} vi phạm.`,
            passed: audit.availability_violation_count === 0,
        },
        {
            title: "Quy Tắc Không Để Phòng Bán Trống",
            desc: `Phòng Thanh Niên THPT Chuyên Hùng Vương luôn có người trực liên tục. Số ca trống: ${audit.empty_room_count}.`,
            passed: audit.empty_room_count === 0,
        },
        {
            title: "Giới Hạn Khối Lượng Trực Hàng Ngày (<=2 ca/ngày)",
            desc: `Đảm bảo sức khỏe và lịch học của thành viên học sinh/sinh viên. Phát hiện: ${audit.daily_overload_count} ca quá tải.`,
            passed: audit.daily_overload_count === 0,
        },
    ];

    let html = "";
    items.forEach((it) => {
        html += `
            <div class="audit-card">
                <div class="audit-status-icon ${it.passed ? "pass" : "fail"}">
                    <i class="fa-solid ${it.passed ? "fa-circle-check" : "fa-circle-xmark"}"></i>
                </div>
                <div class="audit-info">
                    <h5>${it.title}</h5>
                    <p>${it.desc}</p>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

// Incident Management & Live Suggestion
function populateIncidentShiftDropdown() {
    const sel = document.getElementById("incidentShiftSelect");
    if (!sel || !globalScheduleData) return;

    let opts = '<option value="">-- Chọn ca trực phát sinh sự cố --</option>';
    globalScheduleData.assigned_shifts.forEach((s) => {
        opts += `<option value="${s.shift_id}">${s.shift_id} - ${s.day} ${s.slot} (${s.type_label})</option>`;
    });
    sel.innerHTML = opts;
}

async function handleIncidentShiftChange() {
    const shiftId = document.getElementById("incidentShiftSelect")?.value;
    const absentSel = document.getElementById("incidentAbsentSelect");
    const repSel = document.getElementById("incidentReplacementSelect");
    const hint = document.getElementById("replacementHint");

    if (!shiftId || !globalScheduleData) {
        if (absentSel)
            absentSel.innerHTML =
                '<option value="">-- Chọn thành viên --</option>';
        if (repSel)
            repSel.innerHTML =
                '<option value="">-- Chọn nhân sự thay thế --</option>';
        return;
    }

    const s = globalScheduleData.assigned_shifts.find(
        (item) => item.shift_id === shiftId,
    );
    if (!s) return;

    let absentOpts =
        '<option value="">-- Chọn người vắng / đi trễ / đổi ca --</option>';
    s.assigned_members.forEach((m) => {
        absentOpts += `<option value="${m.member_id}">${esc(m.name)} (${esc(m.role)} - ${esc(m.department)})</option>`;
    });
    if (absentSel) absentSel.innerHTML = absentOpts;

    try {
        if (hint) hint.textContent = "Đang tra cứu nhân sự khả dụng...";
        const res = await fetch(`/api/contingency/suggest?shift_id=${shiftId}`);
        const data = await res.json();
        if (data.success) {
            let repOpts =
                '<option value="">-- Chọn nhân sự thay thế --</option>';
            data.candidates.forEach((c) => {
                const badge =
                    c.priority_label ||
                    (c.is_standby ? "⚡ [Đội ứng biến]" : "✓ Rảnh");
                repOpts += `<option value="${c.member_id}">${badge} ${c.name} - ${c.department} (SĐT: ${c.phone})</option>`;
            });
            if (repSel) repSel.innerHTML = repOpts;
            if (hint)
                hint.textContent = `Tìm thấy ${data.total} ứng viên khả dụng (Ưu tiên theo Đội ứng biến & Lịch đã đăng ký rảnh)`;
        }
    } catch (e) {
        if (hint) hint.textContent = "Lỗi tra cứu nhân sự: " + e.message;
    }
}

async function handleSubmitIncident() {
    const shiftId = document.getElementById("incidentShiftSelect")?.value;
    const absentId = document.getElementById("incidentAbsentSelect")?.value;
    const repId = document.getElementById("incidentReplacementSelect")?.value;
    const statusType = document.getElementById("incidentStatusSelect")?.value;
    const note = document.getElementById("incidentNote")?.value;
    const msg = document.getElementById("incidentResultMsg");

    if (!shiftId) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng chọn ca trực!";
        }
        return;
    }

    try {
        const res = await fetch("/api/contingency/log-incident", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shift_id: shiftId,
                absent_member_id: absentId,
                replacement_member_id: repId,
                status_type: statusType,
                note: note,
            }),
        });
        const data = await res.json();
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = data.message;
            }
            loadIncidentLogs();
            loadCurrentSchedule();
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message;
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi: " + e.message;
        }
    }
}

async function loadIncidentLogs() {
    try {
        const res = await fetch("/api/contingency/incidents");
        const data = await res.json();
        if (data.success) {
            globalIncidentLogs = data.incidents || [];
            renderIncidentLogs(globalIncidentLogs);
        }
    } catch (e) {
        console.error("Error loading incidents:", e);
    }
}

function renderIncidentLogs(incidents) {
    const container = document.getElementById("incidentLogsList");
    const tbody = document.getElementById("lateAbsenceTableBody");
    const kpiLate = document.getElementById("kpiLateCount");
    const kpiAbsent = document.getElementById("kpiAbsentCount");
    const kpiReplaced = document.getElementById("kpiReplacedCount");

    if (!incidents || !incidents.length) {
        if (container)
            container.innerHTML = `<div class="empty-note">Chưa có sự cố điểm danh nào được ghi nhận.</div>`;
        if (tbody)
            tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Chưa có dữ liệu đi trễ hoặc vắng mặt nào.</td></tr>`;
        if (kpiLate) kpiLate.textContent = "0";
        if (kpiAbsent) kpiAbsent.textContent = "0";
        if (kpiReplaced) kpiReplaced.textContent = "0";
        return;
    }

    let lateCount = 0;
    let absentCount = 0;
    let replacedCount = 0;

    // Render cards list
    let html = "";
    incidents.forEach((inc) => {
        if (inc.status_type === "Đi trễ") lateCount++;
        if (
            inc.status_type === "Vắng đột xuất" ||
            inc.status_type === "Xin nghỉ trước"
        )
            absentCount++;
        if (
            inc.replacement_member &&
            inc.replacement_member !== "Không thay thế"
        )
            replacedCount++;

        html += `
            <div class="incident-card">
                <div class="incident-card-top">
                    <span>${esc(inc.shift_id)} (${esc(inc.day)} ${esc(inc.slot)})</span>
                    <span class="mk-warn">${esc(inc.status_type)}</span>
                </div>
                <div><strong>Người vắng/trễ:</strong> ${esc(inc.absent_member)} &bull; <strong>Thay thế:</strong> <span class="mk-ok">${esc(inc.replacement_member)}</span></div>
                <div class="incident-card-meta">Địa điểm: ${esc(inc.location || "Phòng Thanh Niên")} &bull; Ghi chú: ${esc(inc.note || "Không có")} &bull; Thời gian: ${esc(inc.timestamp)}</div>
            </div>
        `;
    });
    if (container) container.innerHTML = html;

    // Render separate Late Arrival & Absence Table
    if (tbody) {
        let tableRows = "";
        incidents.forEach((inc, idx) => {
            let badgeClass = "badge-secondary";
            let statusLabel = inc.status_type;

            if (inc.status_type === "Đi trễ") {
                badgeClass = "badge-warning";
                statusLabel = "⏰ Đi trễ";
            } else if (inc.status_type === "Vắng đột xuất") {
                badgeClass = "badge-danger";
                statusLabel = "🚨 Vắng đột xuất";
            } else if (inc.status_type === "Xin nghỉ trước") {
                badgeClass = "badge-info";
                statusLabel = "📝 Xin nghỉ trước";
            } else if (inc.status_type === "Có mặt") {
                badgeClass = "badge-success";
                statusLabel = "✅ Đổi ca thành công";
            }

            tableRows += `
                <tr>
                    <td class="cell-center mk-num">${idx + 1}</td>
                    <td class="cell-center mk-num">${esc(inc.timestamp)}</td>
                    <td><span class="shift-id-tag">${esc(inc.shift_id)}</span> <span style="margin-left: 4px; font-weight: 500;">${esc(inc.day)} ${esc(inc.slot)}</span></td>
                    <td><span style="color: var(--goldleaf); font-weight: 500;">${esc(inc.location || "Phòng Thanh Niên")}</span></td>
                    <td><strong style="color: var(--cinnabar-lt);">${esc(inc.absent_member)}</strong></td>
                    <td class="cell-center"><span class="status-badge ${badgeClass}">${statusLabel}</span></td>
                    <td><strong style="color: var(--patina-lt);">${esc(inc.replacement_member)}</strong></td>
                    <td style="color: var(--ink-dim); font-size: 12px;">${esc(inc.note || "-")}</td>
                </tr>
            `;
        });
        tbody.innerHTML = tableRows;
    }

    if (kpiLate) kpiLate.textContent = String(lateCount);
    if (kpiAbsent) kpiAbsent.textContent = String(absentCount);
    if (kpiReplaced) kpiReplaced.textContent = String(replacedCount);
}

// Data Upload & Google Sheet Sync
async function handleSyncGoogleSheet() {
    const url = document.getElementById("inputGoogleSheetUrl")?.value.trim();
    const msg = document.getElementById("uploadStatusMsg");
    if (!url) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng nhập link Google Sheet!";
        }
        return;
    }

    if (msg) {
        msg.className = "swap-msg";
        msg.style.display = "block";
        msg.textContent = "Đang đồng bộ dữ liệu từ Google Sheets...";
    }

    try {
        const res = await authFetch("/api/upload-data", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ google_sheet_url: url }),
        });
        const data = await res.json();
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = data.message;
            }
            setTimeout(() => {
                document
                    .getElementById("uploadDataModal")
                    .classList.remove("active");
                loadCurrentSchedule();
            }, 1500);
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message;
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối Google Sheets: " + e.message;
        }
    }
}

async function handleUploadFile() {
    const fileInput = document.getElementById("inputFileUpload");
    const msg = document.getElementById("uploadStatusMsg");
    if (!fileInput.files.length) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng chọn file Excel hoặc CSV!";
        }
        return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    if (msg) {
        msg.className = "swap-msg";
        msg.style.display = "block";
        msg.textContent = "Đang tải lên và xử lý dữ liệu...";
    }

    try {
        const res = await authFetch("/api/upload-data", {
            method: "POST",
            body: formData,
        });
        const data = await res.json();
        if (data.success) {
            if (msg) {
                msg.className = "swap-msg success";
                msg.textContent = data.message;
            }
            setTimeout(() => {
                document
                    .getElementById("uploadDataModal")
                    .classList.remove("active");
                loadCurrentSchedule();
            }, 1500);
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message;
            }
        }
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi tải lên: " + e.message;
        }
    }
}

// Preview Modal & Google Sheets Copy
async function openPreviewModal() {
    const modal = document.getElementById("previewModal");
    modal.classList.add("active");

    try {
        const res = await fetch("/api/preview");
        const data = await res.json();
        if (data.success) {
            globalPreviewData = data.preview;
            renderPreviewSheet("tong_ca_truc");
        }
    } catch (e) {
        console.error("Error loading preview:", e);
    }
}

let currentPreviewSheetKey = "tong_ca_truc";
function renderPreviewSheet(sheetKey) {
    currentPreviewSheetKey = sheetKey;
    const container = document.getElementById("previewTableWrap");
    if (!container || !globalPreviewData || !globalPreviewData[sheetKey])
        return;

    const sheet = globalPreviewData[sheetKey];
    let html = `
        <table class="data-table" id="currentPreviewTable">
            <thead>
                <tr>${sheet.headers.map((h) => `<th>${h}</th>`).join("")}</tr>
            </thead>
            <tbody>
                ${sheet.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
}

function copyCurrentPreviewTable() {
    if (!globalPreviewData || !globalPreviewData[currentPreviewSheetKey])
        return;
    const sheet = globalPreviewData[currentPreviewSheetKey];
    const btn = document.getElementById("btnCopyForGSheets");

    let tsv = sheet.headers.join("\t") + "\n";
    sheet.rows.forEach((r) => {
        tsv += r.join("\t") + "\n";
    });

    navigator.clipboard
        .writeText(tsv)
        .then(() => {
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML =
                    '<i class="fa-solid fa-check"></i> Đã sao chép vào Clipboard!';
                btn.classList.add("btn-success-green");
                setTimeout(() => {
                    btn.innerHTML = orig;
                    btn.classList.remove("btn-success-green");
                }, 2500);
            }
        })
        .catch((err) => {
            console.error("Không thể sao chép:", err);
        });
}

// Load Protocols & Task 2 Data
let protocolsData = null;
async function loadProtocols() {
    try {
        const res = await fetch("/api/protocols");
        const data = await res.json();
        if (data.success) {
            protocolsData = data.protocols;
            renderProtocolSection("sec-1");
        }
    } catch (e) {
        console.error("Error loading protocols:", e);
    }
}

function renderProtocolSection(secKey) {
    const body = document.getElementById("protocolBody");
    if (!body || !protocolsData) return;

    let html = "";
    if (secKey === "sec-1") {
        const m1 = protocolsData.muc_1;
        html += `<div class="protocol-section"><h3>${m1.title}</h3>`;
        m1.steps.forEach((s) => {
            html += `
                <div class="protocol-card">
                    <h4>${s.name}</h4>
                    <p>${s.desc}</p>
                </div>
            `;
        });
        html += `</div>`;
    } else if (secKey === "sec-2") {
        const m2 = protocolsData.muc_2;
        html += `<div class="protocol-section"><h3>${m2.title}</h3>`;
        m2.principles.forEach((p, idx) => {
            html += `
                <div class="protocol-card">
                    <h4>Nguyên tắc ${idx + 1}</h4>
                    <p>${p}</p>
                </div>
            `;
        });
        html += `</div>`;
    } else if (secKey === "sec-3") {
        const m3 = protocolsData.muc_3;
        html += `<div class="protocol-section"><h3>${m3.title}</h3>`;
        m3.cases.forEach((c) => {
            html += `
                <div class="protocol-card">
                    <h4>Trạng thái: ${c.status}</h4>
                    <p><strong>Định nghĩa:</strong> ${c.definition}</p>
                    <p><strong>Quy trình xử lý:</strong> ${c.protocol}</p>
                    ${c.steps ? `<ul class="protocol-steps">${c.steps.map((st) => `<li>${st}</li>`).join("")}</ul>` : ""}
                </div>
            `;
        });
        html += `</div>`;
    } else if (secKey === "sec-4") {
        const m4 = protocolsData.muc_4;
        html += `<div class="protocol-section"><h3>${m4.title}</h3>`;
        m4.guidelines.forEach((g, idx) => {
            html += `
                <div class="protocol-card">
                    <h4>Quy định ${idx + 1}</h4>
                    <p>${g}</p>
                </div>
            `;
        });
        html += `</div>`;
    } else if (secKey === "sec-5") {
        const m5 = protocolsData.muc_5;
        html += `<div class="protocol-section"><h3>${m5.title}</h3>`;
        html += `
            <div class="table-responsive">
                <table class="risk-table">
                    <thead>
                        <tr>
                            <th>Mã</th>
                            <th>Hạng Mục</th>
                            <th>Rủi Ro Nhận Diện</th>
                            <th>Xác Suất</th>
                            <th>Mức Độ</th>
                            <th>Biện Pháp Phòng Ngừa</th>
                            <th>Phương Án Ứng Phó Khẩn Cấp</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        m5.risks.forEach((r) => {
            html += `
                <tr>
                    <td><strong>${r.id}</strong></td>
                    <td><span class="shift-id-tag">${r.category}</span></td>
                    <td>${r.risk_event}</td>
                    <td><span class="mk-warn">${r.probability}</span></td>
                    <td><span class="mk-bad">${r.impact}</span></td>
                    <td>${r.prevention}</td>
                    <td>${r.mitigation}</td>
                </tr>
            `;
        });
        html += `</tbody></table></div></div>`;
    }

    body.innerHTML = html;
}

// ---------------------------------------------------------------------------
// QUẢN LÝ KHO HÀNG & DOANH THU F&B
// ---------------------------------------------------------------------------

function formatVND(num) {
    const val = Number(num) || 0;
    return val.toLocaleString("vi-VN") + " ₫";
}

async function loadInventoryData() {
    try {
        const res = await fetch("/api/inventory");
        const data = await res.json();
        if (data.success) {
            globalInventoryData = data;
            renderInventoryKPIs(data.kpis);
            renderInventoryTable(data.products || []);
            renderSalesLogsTable(data.sales_logs || []);
            populateSaleProductOptions(data.products || []);
            renderLivePOSProductGrid();
            if (currentSelectedLiveShiftId) {
                renderLiveShiftSalesTable(currentSelectedLiveShiftId);
            }
        }
    } catch (e) {
        console.error("Error loading inventory data:", e);
    }
}

function renderInventoryKPIs(kpis) {
    if (!kpis) return;
    const revEl = document.getElementById("invKpiRevenue");
    const stockEl = document.getElementById("invKpiTotalStock");
    const soldEl = document.getElementById("invKpiTotalSold");
    const valEl = document.getElementById("invKpiStockValue");

    if (revEl) revEl.textContent = formatVND(kpis.total_revenue);
    if (stockEl)
        stockEl.textContent = `${(kpis.total_stock || 0).toLocaleString("vi-VN")} SP`;
    if (soldEl)
        soldEl.textContent = `${(kpis.total_sold || 0).toLocaleString("vi-VN")} SP`;
    if (valEl) valEl.textContent = formatVND(kpis.total_stock_value);
}

function renderInventoryTable(products) {
    const tbody = document.getElementById("inventoryTableBody");
    if (!tbody) return;

    if (!products.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Kho hàng đang trống. Nhấn "+ Thêm Sản Phẩm" để tạo mới sản phẩm.</td></tr>`;
        return;
    }

    let html = "";
    products.forEach((p) => {
        const currentStock =
            p.current_stock !== undefined
                ? p.current_stock
                : p.initial_stock - p.sold_count;
        let badgeClass = "high";
        if (currentStock <= 0) {
            badgeClass = "empty";
        } else if (currentStock < 20) {
            badgeClass = "low";
        }

        const rev = (p.sold_count || 0) * (p.price || 0);

        html += `
            <tr>
                <td class="cell-center"><strong>${esc(p.id)}</strong></td>
                <td>
                    <strong>${esc(p.name)}</strong>
                    ${p.note ? `<div class="mer-meta">${esc(p.note)}</div>` : ""}
                </td>
                <td class="cell-center"><span class="shift-id-tag">${esc(p.unit)}</span></td>
                <td class="cell-center mk-num" style="font-weight: 600;">${formatVND(p.price)}</td>
                <td class="cell-center mk-num">${p.initial_stock}</td>
                <td class="cell-center mk-lead"><b>${p.sold_count}</b></td>
                <td class="cell-center">
                    <span class="stock-badge ${badgeClass}">${currentStock} ${esc(p.unit)}</span>
                </td>
                <td class="cell-center mk-num" style="color: var(--goldleaf); font-weight: 600;">
                    ${formatVND(rev)}
                </td>
                <td class="cell-center">
                    <div style="display: inline-flex; gap: 6px;">
                        <button type="button" class="btn-action-sm btn-action-sell" onclick="openQuickSaleModal('${esc(p.id)}')" title="Bán nhanh">
                            <i class="fa-solid fa-cart-plus"></i> Bán
                        </button>
                        ${
                            currentUserRole === "admin"
                                ? `
                            <button type="button" class="btn-action-sm btn-action-edit" onclick="openEditProductModal('${esc(p.id)}')" title="Sửa">
                                <i class="fa-solid fa-pen"></i> Sửa
                            </button>
                            <button type="button" class="btn-action-sm btn-action-delete" onclick="deleteProductItem('${esc(p.id)}')" title="Xóa">
                                <i class="fa-solid fa-trash-can"></i> Xóa
                            </button>
                        `
                                : ""
                        }
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function renderSalesLogsTable(logs) {
    const tbody = document.getElementById("salesLogsTableBody");
    if (!tbody) return;

    if (!logs.length) {
        tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Chưa có giao dịch bán hàng nào được ghi nhận.</td></tr>`;
        return;
    }

    let html = "";
    logs.forEach((l) => {
        const unitPrice = l.unit_price !== undefined ? l.unit_price : l.price;
        const isRefunded = l.refunded === true;
        const refundBadge = isRefunded
            ? `<span class="status-badge badge-danger" style="background-color: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); margin-left: 6px; font-size: 10px; padding: 1px 4px;">Đã hủy</span>`
            : "";
        const rowStyle = isRefunded
            ? 'style="opacity: 0.6; text-decoration: line-through;"'
            : "";
        const actionBtn = isRefunded
            ? `<span style="color: var(--ink-dim); font-size: 12px;"><i class="fa-solid fa-ban"></i> Đã hủy</span>`
            : `
            <button type="button" class="btn-action-sm btn-action-delete" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 3px 8px;" onclick="refundTransaction('${l.id}')" title="Hủy đơn hàng">
                <i class="fa-solid fa-rotate-left"></i> Hủy
            </button>
        `;

        html += `
            <tr ${rowStyle}>
                <td class="cell-center"><strong>${esc(l.id)}</strong>${refundBadge}</td>
                <td class="cell-center mk-num">${esc(l.timestamp || "")}</td>
                <td><strong>${esc(l.product_name)}</strong> <small>(${esc(l.product_id)})</small></td>
                <td class="cell-center mk-lead"><b>${l.quantity}</b> ${esc(l.unit || "SP")}</td>
                <td class="cell-center mk-num">${formatVND(unitPrice)}</td>
                <td class="cell-center mk-num" style="color: ${isRefunded ? "var(--ink-dim)" : "var(--goldleaf)"}; font-weight: 600;">${formatVND(l.total_amount)}</td>
                <td class="cell-center"><span class="shift-id-tag">${esc(l.channel || "Phòng Thanh Niên")}</span></td>
                <td>${esc(l.seller || "Ban Quản Trị")}</td>
                <td><small>${esc(l.note || "")}</small></td>
                <td class="cell-center">${actionBtn}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function populateSaleProductOptions(products) {
    const sel = document.getElementById("saleSelectProduct");
    if (!sel) return;

    let opts = '<option value="">-- Chọn sản phẩm --</option>';
    (products || []).forEach((p) => {
        const cur =
            p.current_stock !== undefined
                ? p.current_stock
                : p.initial_stock - p.sold_count;
        opts += `<option value="${p.id}" data-price="${p.price}" data-unit="${p.unit}" data-stock="${cur}">${p.name} (${p.id}) - ${formatVND(p.price)} [Còn: ${cur} ${p.unit}]</option>`;
    });
    sel.innerHTML = opts;
}

function openProductModalForAdd() {
    const modal = document.getElementById("productModal");
    if (!modal) return;

    document.getElementById("productModalTitle").innerHTML =
        `<i class="fa-solid fa-box-open"></i> Thêm Sản Phẩm Mới Vào Kho`;
    document.getElementById("inputProdOriginalId").value = "";
    document.getElementById("inputProdId").value = "";
    document.getElementById("inputProdId").disabled = false;
    document.getElementById("inputProdName").value = "";
    document.getElementById("inputProdUnit").value = "Ly";
    document.getElementById("inputProdPrice").value = "20000";
    document.getElementById("inputProdInitial").value = "100";
    document.getElementById("inputProdSold").value = "0";
    document.getElementById("inputProdNote").value = "";

    const msg = document.getElementById("productModalMsg");
    if (msg) msg.textContent = "";

    modal.classList.add("active");
}

window.openEditProductModal = function (productId) {
    if (!globalInventoryData || !globalInventoryData.products) return;
    const p = globalInventoryData.products.find(
        (item) => item.id === productId,
    );
    if (!p) return;

    const modal = document.getElementById("productModal");
    if (!modal) return;

    document.getElementById("productModalTitle").innerHTML =
        `<i class="fa-solid fa-pen-to-square"></i> Cập Nhật Sản Phẩm ${p.id}`;
    document.getElementById("inputProdOriginalId").value = p.id;
    document.getElementById("inputProdId").value = p.id;
    document.getElementById("inputProdId").disabled = true;
    document.getElementById("inputProdName").value = p.name || "";
    document.getElementById("inputProdUnit").value = p.unit || "Ly";
    document.getElementById("inputProdPrice").value = p.price || 0;
    document.getElementById("inputProdInitial").value = p.initial_stock || 0;
    document.getElementById("inputProdSold").value = p.sold_count || 0;
    document.getElementById("inputProdNote").value = p.note || "";

    const msg = document.getElementById("productModalMsg");
    if (msg) msg.textContent = "";

    modal.classList.add("active");
};

async function handleSaveProduct(e) {
    e.preventDefault();
    const id = document.getElementById("inputProdId").value.trim();
    const name = document.getElementById("inputProdName").value.trim();
    const unit = document.getElementById("inputProdUnit").value;
    const price =
        parseInt(document.getElementById("inputProdPrice").value) || 0;
    const initial_stock =
        parseInt(document.getElementById("inputProdInitial").value) || 0;
    const sold_count =
        parseInt(document.getElementById("inputProdSold").value) || 0;
    const note = document.getElementById("inputProdNote").value.trim();
    const msg = document.getElementById("productModalMsg");

    if (!name) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng nhập tên sản phẩm!";
        }
        return;
    }

    try {
        const res = await authFetch("/api/inventory/product", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id,
                name,
                unit,
                price,
                initial_stock,
                sold_count,
                note,
            }),
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById("productModal")?.classList.remove("active");
            loadInventoryData();
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message || "Lỗi lưu sản phẩm";
            }
        }
    } catch (err) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối: " + err.message;
        }
    }
}

window.deleteProductItem = function (productId) {
    openConfirmModal({
        title: "Xác Nhận Xóa Sản Phẩm",
        message: `Bạn có chắc chắn muốn xóa sản phẩm mã "${productId}" khỏi danh mục kho hàng?`,
        confirmBtnText: "Xóa Sản Phẩm",
        onConfirm: async () => {
            try {
                const res = await authFetch("/api/inventory/delete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: productId }),
                });
                const data = await res.json();
                if (data.success) {
                    loadInventoryData();
                } else {
                    console.error("Không thể xóa sản phẩm:", data.message);
                }
            } catch (err) {
                console.error("Lỗi xóa sản phẩm:", err);
            }
        },
    });
};

window.openQuickSaleModal = function (productId = "") {
    const modal = document.getElementById("recordSaleModal");
    if (!modal) return;

    const sel = document.getElementById("saleSelectProduct");
    if (sel && productId) {
        sel.value = productId;
    }
    const qtyInp = document.getElementById("saleInputQty");
    if (qtyInp) qtyInp.value = 1;

    const sellerInp = document.getElementById("saleInputSeller");
    if (sellerInp && !sellerInp.value) {
        sellerInp.value = "Ban Quản Trị";
    }

    const noteInp = document.getElementById("saleInputNote");
    if (noteInp) noteInp.value = "";

    const msg = document.getElementById("saleModalMsg");
    if (msg) msg.textContent = "";

    updateSaleCalcTotal();
    modal.classList.add("active");
};

function updateSaleCalcTotal() {
    const sel = document.getElementById("saleSelectProduct");
    const qtyInp = document.getElementById("saleInputQty");
    const totalOut = document.getElementById("saleCalcTotal");
    const hint = document.getElementById("saleProductStockHint");

    if (!sel || !qtyInp || !totalOut) return;

    const opt = sel.selectedOptions[0];
    if (!opt || !opt.value) {
        totalOut.textContent = "0 ₫";
        if (hint) hint.textContent = "";
        return;
    }

    const price = parseInt(opt.getAttribute("data-price")) || 0;
    const stock = parseInt(opt.getAttribute("data-stock")) || 0;
    const unit = opt.getAttribute("data-unit") || "SP";
    const qty = parseInt(qtyInp.value) || 0;

    const total = price * qty;
    totalOut.textContent = formatVND(total);

    if (hint) {
        if (stock < qty) {
            hint.innerHTML = `<span style="color: var(--cinnabar-lt);">⚠️ Cảnh báo: Tồn kho chỉ còn ${stock} ${unit}, không đủ đáp ứng ${qty} ${unit}!</span>`;
        } else {
            hint.textContent = `Tồn kho hiện có: ${stock} ${unit}`;
        }
    }
}

async function handleSaveSale(e) {
    e.preventDefault();
    const sel = document.getElementById("saleSelectProduct");
    const prodId = sel ? sel.value : "";
    const qty = parseInt(document.getElementById("saleInputQty")?.value) || 1;
    const channel =
        document.getElementById("saleSelectChannel")?.value ||
        "Phòng Thanh Niên";
    const seller =
        document.getElementById("saleInputSeller")?.value || "Ban Quản Trị";
    const note = document.getElementById("saleInputNote")?.value || "";
    const msg = document.getElementById("saleModalMsg");

    if (!prodId) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Vui lòng chọn sản phẩm cần bán!";
        }
        return;
    }

    try {
        const res = await fetch("/api/inventory/sell", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                product_id: prodId,
                quantity: qty,
                channel: channel,
                seller: seller,
                note: note,
            }),
        });
        const data = await res.json();
        if (data.success) {
            document
                .getElementById("recordSaleModal")
                ?.classList.remove("active");
            loadInventoryData();
        } else {
            if (msg) {
                msg.className = "swap-msg error";
                msg.textContent = data.message || "Lỗi ghi nhận bán hàng";
            }
        }
    } catch (err) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi kết nối: " + err.message;
        }
    }
}

async function handleResetInventory() {
    try {
        const res = await fetch("/api/inventory/reset", { method: "POST" });
        const data = await res.json();
        if (data.success) {
            loadInventoryData();
        }
    } catch (e) {
        console.error("Error resetting inventory:", e);
    }
}

// ---------------------------------------------------------------------------
// CA-LIVE & THU NGÂN POS MODULE
// ---------------------------------------------------------------------------
let liveCart = {}; // { product_id: { product, quantity } }
let currentSelectedLiveShiftId = null;

function startLiveClock() {
    const clockEl = document.getElementById("liveRealTimeClock");
    if (!clockEl) return;
    const update = () => {
        const now = new Date();
        const dateStr = now.toLocaleDateString("vi-VN", {
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
        });
        const timeStr = now.toLocaleTimeString("vi-VN");
        clockEl.textContent = `${dateStr} - ${timeStr}`;
    };
    update();
    setInterval(update, 1000);
}

function formatShiftTimeValue(shift) {
    const start = shift?.start_time || shift?.shift_start_time || "";
    const end = shift?.end_time || shift?.shift_end_time || "";
    const slot = shift?.slot || "";

    if (start && end) {
        return `${start} - ${end}`;
    }
    if (slot) {
        return slot;
    }
    return "Ca trực";
}

function formatShiftSummaryLabel(shift) {
    const day = shift?.day || "";
    const time = formatShiftTimeValue(shift);
    const loc =
        shift?.location ||
        (shift?.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên");
    const leader = shift?.shift_leader
        ? ` • Trưởng ca: ${shift.shift_leader}`
        : "";
    return `${day} • ${time} • ${loc}${leader}`;
}

function getShiftTimeDistance(shift) {
    const dayMap = {
        "Thứ 2": 1,
        "Thứ 3": 2,
        "Thứ 4": 3,
        "Thứ 5": 4,
        "Thứ 6": 5,
        "Thứ 7": 6,
        "Chủ Nhật": 0,
    };
    const now = new Date();
    const currentDayIdx = now.getDay();
    const shiftDayIdx = dayMap[shift.day] !== undefined ? dayMap[shift.day] : 1;

    let dayDiff = Math.abs(currentDayIdx - shiftDayIdx);
    if (dayDiff > 3) dayDiff = 7 - dayDiff;

    let startHour = 8;
    if (shift.slot) {
        const match = shift.slot.match(/^(\d+)h/);
        if (match) startHour = parseInt(match[1], 10);
    } else if (shift.start_time) {
        const match = shift.start_time.match(/^(\d+):/);
        if (match) startHour = parseInt(match[1], 10);
    }
    const currentHour = now.getHours();
    const hourDiff = Math.abs(currentHour - startHour);

    return dayDiff * 100 + hourDiff;
}

function populateLiveShiftDropdown() {
    const select = document.getElementById("liveShiftSelect");
    if (!select || !globalScheduleData || !globalScheduleData.assigned_shifts)
        return;

    const shifts = [...globalScheduleData.assigned_shifts];
    shifts.sort((a, b) => getShiftTimeDistance(a) - getShiftTimeDistance(b));

    let html = "";
    shifts.forEach((s, idx) => {
        const isClosest = idx === 0;
        const badge = isClosest ? "🔴 [CA HIỆN TẠI / GẦN NHẤT]" : "🗓️";
        const loc =
            s.location ||
            (s.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên");
        const leader = s.shift_leader ? ` • Trưởng ca: ${s.shift_leader}` : "";
        const timeLabel = formatShiftTimeValue(s);
        html += `<option value="${s.shift_id}" ${isClosest ? "selected" : ""}>
            ${badge} Ca ${s.shift_id} • ${s.day} • ${timeLabel} • ${loc} [${s.assigned_count}/${s.required_count} TV]${leader}
        </option>`;
    });

    select.innerHTML = html;
    if (shifts.length > 0) {
        currentSelectedLiveShiftId = shifts[0].shift_id;
        loadLiveShiftDetailsAndCandidates(shifts[0].shift_id);
    }
}

// Global state for live attendance screen
let localAttendanceState = {}; // Key: member_id, Value: { status: string|null, replacementId: string|null, isModified: boolean }
let currentShiftCandidates = []; // Suggested backup candidates

async function loadLiveShiftDetailsAndCandidates(shiftId) {
    currentSelectedLiveShiftId = shiftId;

    // 1. Fetch suggestions/candidates for this shift
    try {
        const res = await fetch(
            `/api/contingency/suggest?shift_id=${shiftId}`,
        ).then((r) => r.json());
        if (res.success) {
            currentShiftCandidates = res.candidates || [];
        } else {
            currentShiftCandidates = [];
        }
    } catch (e) {
        console.error("Error fetching shift candidates:", e);
        currentShiftCandidates = [];
    }

    // 2. Initialize localAttendanceState from current incident logs
    localAttendanceState = {};
    if (globalScheduleData && globalScheduleData.assigned_shifts) {
        const shift = globalScheduleData.assigned_shifts.find(
            (s) => s.shift_id === shiftId,
        );
        if (shift) {
            const incidents = globalIncidentLogs || [];
            (shift.assigned_members || []).forEach((m) => {
                const lastLog = incidents.find(
                    (l) =>
                        l.shift_id === shiftId &&
                        (l.absent_member === m.name ||
                            l.absent_member_id === m.member_id),
                );
                localAttendanceState[m.member_id] = {
                    status: lastLog ? lastLog.status_type : null,
                    replacementId: lastLog
                        ? lastLog.replacement_member_id || ""
                        : "",
                    isModified: false,
                };
            });
        }
    }

    // 3. Render
    renderLiveShiftDetails(shiftId);
}

function renderLiveShiftDetails(shiftId) {
    if (!globalScheduleData || !globalScheduleData.assigned_shifts) return;
    const shift = globalScheduleData.assigned_shifts.find(
        (s) => s.shift_id === shiftId,
    );
    if (!shift) return;

    currentSelectedLiveShiftId = shiftId;
    const subEl = document.getElementById("liveShiftInfoSub");
    if (subEl) {
        const loc =
            shift.location ||
            (shift.type === "Ngoai" ? "Điểm Bán Ngoài" : "Phòng Thanh Niên");
        const timeLabel = formatShiftTimeValue(shift);
        subEl.innerHTML = `Đang chọn ca: <strong style="color:var(--goldleaf);">${esc(shift.shift_id)}</strong> • ${esc(shift.day)} • ${esc(timeLabel)} • Địa điểm: <strong>${esc(loc)}</strong>`;
    }

    const memberListEl = document.getElementById("liveShiftMemberList");
    if (memberListEl) {
        let memHtml = "";

        (shift.assigned_members || []).forEach((m) => {
            const isLeader = shift.shift_leader === m.name;
            const isDp = m.role !== "Chính";
            const task =
                m.position_role ||
                (isDp ? "⚡ Dự bị tiếp ứng" : "🛵 Phục vụ / Bán hàng");

            // Get status and replacement from local state
            const localState = localAttendanceState[m.member_id] || {
                status: null,
                replacementId: "",
                isModified: false,
            };
            const currentStatus = localState.status;

            let cardBg = "rgba(255,255,255,0.03)";
            let cardBorder = "1px solid rgba(255,255,255,0.08)";
            let cardLeftBorder = "4px solid var(--goldleaf)";
            let statusBadge =
                '<span class="tag" style="background:rgba(255,255,255,0.06); color:var(--ink-dim); border:1px solid rgba(255,255,255,0.1); padding:3px 8px;"><i class="fa-regular fa-circle"></i> Chưa điểm danh</span>';

            if (currentStatus === "Có mặt") {
                cardBg = "rgba(16,185,129,0.08)";
                cardBorder = "1px solid rgba(16,185,129,0.25)";
                cardLeftBorder = "4px solid #10B981";
                statusBadge =
                    '<span class="tag" style="background:rgba(16,185,129,0.25); color:#34D399; border:1px solid #059669; padding:3px 8px; font-weight:700;"><i class="fa-solid fa-circle-check"></i> Có mặt đúng giờ</span>';
            } else if (currentStatus === "Đi trễ") {
                cardBg = "rgba(245,158,11,0.08)";
                cardBorder = "1px solid rgba(245,158,11,0.25)";
                cardLeftBorder = "4px solid #F59E0B";
                statusBadge =
                    '<span class="tag" style="background:rgba(245,158,11,0.25); color:#FBBF24; border:1px solid #D97706; padding:3px 8px; font-weight:700;"><i class="fa-solid fa-clock-rotate-left"></i> Báo đi trễ</span>';
            } else if (
                currentStatus === "Vắng đột xuất" ||
                currentStatus === "Xin nghỉ trước" ||
                currentStatus === "Vắng mặt"
            ) {
                cardBg = "rgba(239,68,68,0.08)";
                cardBorder = "1px solid rgba(239,68,68,0.25)";
                cardLeftBorder = "4px solid #EF4444";
                statusBadge =
                    '<span class="tag" style="background:rgba(239,68,68,0.25); color:#FCA5A5; border:1px solid #DC2626; padding:3px 8px; font-weight:700;"><i class="fa-solid fa-triangle-exclamation"></i> Vắng mặt khẩn cấp</span>';
            }

            // Build replacement dropdown HTML if marked as absent
            let replacementHtml = "";
            const isAbsent =
                currentStatus === "Vắng đột xuất" ||
                currentStatus === "Xin nghỉ trước" ||
                currentStatus === "Vắng mặt";
            if (isAbsent) {
                let optionsHtml = `<option value="">-- Chọn nhân sự thay thế --</option>`;
                optionsHtml += `<option value="no_replacement" ${localState.replacementId === "no_replacement" || !localState.replacementId ? "selected" : ""}>Không cần thay thế / Chờ tự ứng phó</option>`;

                (currentShiftCandidates || []).forEach((cand) => {
                    const selectedAttr =
                        localState.replacementId === cand.member_id
                            ? "selected"
                            : "";
                    optionsHtml += `<option value="${esc(cand.member_id)}" ${selectedAttr}>${esc(cand.name)} [${esc(cand.priority_label)}] - ${esc(cand.phone)}</option>`;
                });

                replacementHtml = `
                    <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 4px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; border: 1px dashed rgba(239,68,68,0.3);">
                        <label style="font-size: 12px; font-weight: 600; color: #FCA5A5;"><i class="fa-solid fa-people-arrows"></i> Chỉ Định Nhân Sự Thay Thế (Backup):</label>
                        <select class="custom-select" style="font-size: 13px; font-weight: 500; height: 36px; padding: 4px 8px; border-radius: 4px; border: 1px solid var(--border-color); background: var(--bg-card-alt); color: var(--ink-hi);" onchange="setLocalReplacement('${esc(m.member_id)}', this.value)">
                            ${optionsHtml}
                        </select>
                    </div>
                `;
            }

            // Render buttons: only for 'Chính' members by default. Backup members don't need check-in unless abnormalities occur.
            let buttonsHtml = "";
            if (!isDp) {
                buttonsHtml = `
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
                        <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Có mặt')" style="background: ${currentStatus === "Có mặt" ? "#059669" : "rgba(16,185,129,0.15)"}; color: ${currentStatus === "Có mặt" ? "#FFF" : "#34D399"}; border: 1px solid #059669; padding: 6px 12px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer;" title="Điểm danh có mặt đúng giờ">
                            ✅ Có mặt
                        </button>
                        <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Đi trễ')" style="background: ${currentStatus === "Đi trễ" ? "#D97706" : "rgba(245,158,11,0.15)"}; color: ${currentStatus === "Đi trễ" ? "#FFF" : "#FBBF24"}; border: 1px solid #D97706; padding: 6px 12px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer;" title="Báo đi trễ">
                            ⏰ Đi trễ
                        </button>
                        <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Vắng đột xuất')" style="background: ${isAbsent ? "#DC2626" : "rgba(239,68,68,0.15)"}; color: ${isAbsent ? "#FFF" : "#FCA5A5"}; border: 1px solid #DC2626; padding: 6px 12px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer;" title="Báo vắng mặt khẩn cấp">
                            🚨 Vắng mặt
                        </button>
                    </div>
                `;
            } else {
                const hasAbnormality = localState.status !== null;
                if (!hasAbnormality) {
                    buttonsHtml = `
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); align-items: center; justify-content: space-between;">
                            <span style="font-size: 12px; color: var(--ink-dim); font-style: italic;"><i class="fa-solid fa-circle-info"></i> Nhân sự dự phòng (Không cần điểm danh ca trực chuẩn)</span>
                            <button type="button" class="btn-action-sm" onclick="revealBackupAttendance('${esc(m.member_id)}')" style="background: rgba(139,92,246,0.15); color: #C084FC; border: 1px solid #7C3AED; padding: 4px 8px; font-size: 11px; border-radius: 4px; cursor: pointer;">
                                <i class="fa-solid fa-triangle-exclamation"></i> Có bất thường
                            </button>
                        </div>
                    `;
                } else {
                    buttonsHtml = `
                        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
                            <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Có mặt')" style="background: ${currentStatus === "Có mặt" ? "#059669" : "rgba(16,185,129,0.15)"}; color: ${currentStatus === "Có mặt" ? "#FFF" : "#34D399"}; border: 1px solid #059669; padding: 6px 12px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer;">
                                ✅ Có mặt
                            </button>
                            <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Đi trễ')" style="background: ${currentStatus === "Đi trễ" ? "#D97706" : "rgba(245,158,11,0.15)"}; color: ${currentStatus === "Đi trễ" ? "#FFF" : "#FBBF24"}; border: 1px solid #D97706; padding: 6px 12px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer;">
                                ⏰ Đi trễ
                            </button>
                            <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', 'Vắng đột xuất')" style="background: ${isAbsent ? "#DC2626" : "rgba(239,68,68,0.15)"}; color: ${isAbsent ? "#FFF" : "#FCA5A5"}; border: 1px solid #DC2626; padding: 6px 12px; font-weight: 600; font-size: 12px; border-radius: 6px; cursor: pointer;">
                                🚨 Vắng mặt
                            </button>
                            <button type="button" class="btn-action-sm" onclick="setLocalAttendanceStatus('${esc(m.member_id)}', null)" style="background: rgba(255,255,255,0.06); color: var(--ink-dim); border: 1px solid var(--border-color); padding: 6px 12px; font-size: 12px; border-radius: 6px; cursor: pointer;">
                                Hủy bất thường
                            </button>
                        </div>
                    `;
                }
            }

            memHtml += `
                <div style="background: ${cardBg}; border: ${cardBorder}; border-left: ${cardLeftBorder}; border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; transition: all 0.2s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                <strong style="font-size: 15px; color: #FFF; font-weight: 700;">${isLeader ? "⭐ " : ""}${esc(m.name)}</strong>
                                <span class="tag" style="background: ${isLeader ? "rgba(217,119,6,0.3)" : isDp ? "rgba(109,40,217,0.3)" : "rgba(255,255,255,0.1)"}; color: ${isLeader ? "#FBBF24" : isDp ? "#C084FC" : "var(--ink-light)"}; border: 1px solid ${isLeader ? "#D97706" : isDp ? "#7C3AED" : "var(--border-color)"};">
                                    ${isLeader ? "Trưởng ca" : isDp ? "Dự phòng" : esc(m.department)}
                                </span>
                            </div>
                            <div style="font-size: 12px; color: var(--ink-dim); margin-top: 4px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span><i class="fa-solid fa-phone" style="color: var(--goldleaf);"></i> ${esc(m.phone)}</span>
                                <span>&bull; Nhiệm vụ: <strong style="color: var(--goldleaf); font-weight: 600;">${esc(task)}</strong></span>
                            </div>
                        </div>
                        <div>
                            ${statusBadge}
                        </div>
                    </div>
                    ${replacementHtml}
                    ${buttonsHtml}
                </div>
            `;
        });

        memberListEl.innerHTML =
            memHtml ||
            '<div class="table-empty">Không có nhân sự trong ca này.</div>';
    }

    const sellerSel = document.getElementById("livePOSSelectSeller");
    if (sellerSel) {
        let sellerOpts = "";
        (shift.assigned_members || []).forEach((m) => {
            const isLeader = shift.shift_leader === m.name;
            sellerOpts += `<option value="${esc(m.name)}" ${isLeader ? "selected" : ""}>${isLeader ? "⭐ " : ""}${esc(m.name)} (${esc(m.department)})</option>`;
        });
        sellerSel.innerHTML =
            sellerOpts || '<option value="Ban Quản Trị">Ban Quản Trị</option>';
    }

    renderLivePOSProductGrid();
    renderLiveShiftSalesTable(shiftId);
}

window.setLocalAttendanceStatus = function (memberId, status) {
    if (!localAttendanceState[memberId]) {
        localAttendanceState[memberId] = {
            status: null,
            replacementId: "",
            isModified: false,
        };
    }
    localAttendanceState[memberId].status = status;
    localAttendanceState[memberId].isModified = true;

    // Clear replacement if status is not absent
    if (
        status !== "Vắng đột xuất" &&
        status !== "Xin nghỉ trước" &&
        status !== "Vắng mặt"
    ) {
        localAttendanceState[memberId].replacementId = "";
    } else {
        if (!localAttendanceState[memberId].replacementId) {
            localAttendanceState[memberId].replacementId = "no_replacement";
        }
    }
    renderLiveShiftDetails(currentSelectedLiveShiftId);
};

window.setLocalReplacement = function (memberId, replacementId) {
    if (!localAttendanceState[memberId]) {
        localAttendanceState[memberId] = {
            status: null,
            replacementId: "",
            isModified: false,
        };
    }
    localAttendanceState[memberId].replacementId = replacementId;
    localAttendanceState[memberId].isModified = true;
    renderLiveShiftDetails(currentSelectedLiveShiftId);
};

window.revealBackupAttendance = function (memberId) {
    if (!localAttendanceState[memberId]) {
        localAttendanceState[memberId] = {
            status: null,
            replacementId: "",
            isModified: false,
        };
    }
    localAttendanceState[memberId].status = "Có mặt"; // Initial abnormality
    localAttendanceState[memberId].isModified = true;
    renderLiveShiftDetails(currentSelectedLiveShiftId);
};

window.submitLiveAttendanceBatch = async function () {
    if (!currentSelectedLiveShiftId) return;

    const keys = Object.keys(localAttendanceState);
    const modifiedKeys = keys.filter((k) => localAttendanceState[k].isModified);

    if (modifiedKeys.length === 0) {
        alert("Không có thay đổi điểm danh nào để lưu.");
        return;
    }

    let summaryText = "Xác nhận cập nhật điểm danh ca trực:\n";
    modifiedKeys.forEach((k) => {
        const mState = localAttendanceState[k];
        const shift = globalScheduleData.assigned_shifts.find(
            (s) => s.shift_id === currentSelectedLiveShiftId,
        );
        const member = shift?.assigned_members?.find(
            (sm) => sm.member_id === k,
        ) || { name: k };

        let repName = "Không thay thế";
        if (mState.replacementId && mState.replacementId !== "no_replacement") {
            const repObj =
                currentShiftCandidates.find(
                    (c) => c.member_id === mState.replacementId,
                ) ||
                globalScheduleData.member_stats?.find(
                    (ms) => ms.member_id === mState.replacementId,
                );
            if (repObj) repName = repObj.name;
        }

        summaryText += `- ${member.name}: ${mState.status || "Chưa điểm danh"} (Thay thế: ${repName})\n`;
    });

    openConfirmModal({
        title: "Xác Nhận Lưu Điểm Danh & Backup",
        message: summaryText,
        confirmBtnText: "Lưu Hệ Thống",
        onConfirm: async () => {
            try {
                const btn = document.getElementById("btnConfirmLiveAttendance");
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...`;
                }

                // Submit sequentially to prevent any race conditions in server-side persist
                for (const k of modifiedKeys) {
                    const mState = localAttendanceState[k];
                    const payload = {
                        shift_id: currentSelectedLiveShiftId,
                        absent_member_id: k,
                        status_type: mState.status || "Có mặt",
                        note: `Điểm danh ca-live: ${mState.status || "Có mặt"}`,
                    };

                    if (
                        mState.replacementId &&
                        mState.replacementId !== "no_replacement"
                    ) {
                        payload.replacement_member_id = mState.replacementId;
                    }

                    const res = await fetch("/api/contingency/log-incident", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    }).then((r) => r.json());

                    if (!res.success) {
                        console.error(
                            "Lỗi khi ghi nhận thành viên",
                            k,
                            res.message,
                        );
                    }
                }

                await loadIncidentLogs();
                await loadCurrentSchedule(); // Reloads and invokes populateUI -> triggers populateLiveShiftDropdown -> loadLiveShiftDetailsAndCandidates

                alert(
                    "✓ Đã cập nhật điểm danh & kích hoạt phương án backup thành công!",
                );
            } catch (e) {
                console.error("Lỗi kết nối điểm danh:", e);
                alert(
                    "Có lỗi xảy ra trong quá trình ghi nhận điểm danh: " +
                        e.message,
                );
            } finally {
                const btn = document.getElementById("btnConfirmLiveAttendance");
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Lưu Điểm Danh &amp; Gọi Backup`;
                }
            }
        },
    });
};

function renderLivePOSProductGrid() {
    const grid = document.getElementById("livePOSProductGrid");
    const quickSel = document.getElementById("livePOSQuickSelect");
    if (!grid) return;
    const products = globalInventoryData?.products || [];

    // Populate quick select dropdown
    if (quickSel) {
        let opts = '<option value="">-- Chọn nhanh sản phẩm từ kho --</option>';
        products.forEach((p) => {
            const stock =
                p.current_stock !== undefined
                    ? p.current_stock
                    : Math.max(0, (p.initial_stock || 0) - (p.sold_count || 0));
            const isOutOfStock = stock <= 0;
            opts += `<option value="${p.id}" ${isOutOfStock ? "disabled" : ""}>${esc(p.name)} - ${formatVND(p.price)} (Tồn: ${stock} ${p.unit})</option>`;
        });
        quickSel.innerHTML = opts;
    }

    if (!products.length) {
        grid.innerHTML =
            '<div style="grid-column: 1/-1; color: var(--ink-dim); font-size: 13px; padding: 12px; text-align: center;">Kho sản phẩm chưa có dữ liệu. Hãy thêm sản phẩm ở tab Kho Hàng.</div>';
        return;
    }

    let html = "";
    products.forEach((p) => {
        const stock =
            p.current_stock !== undefined
                ? p.current_stock
                : Math.max(0, (p.initial_stock || 0) - (p.sold_count || 0));
        const isOutOfStock = stock <= 0;
        html += `
            <div style="background: var(--lacquer-3); border: 1px solid var(--rule); border-radius: 8px; padding: 10px; text-align: center; display: flex; flex-direction: column; justify-content: space-between; transition: all 0.2s ease; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);">
                <div>
                    <strong style="font-size: 13px; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--ink-hi);" title="${esc(p.name)}">${esc(p.name)}</strong>
                    <span style="font-size: 13px; color: var(--goldleaf); font-weight: 700; display: block; margin: 4px 0;">${formatVND(p.price)}</span>
                    <span style="font-size: 11px; color: ${isOutOfStock ? "#F87171" : "#16A34A"}; display: block; margin-bottom: 8px; font-weight: 500;">Tồn: ${stock} ${p.unit}</span>
                </div>
                <button type="button" class="btn-action-sm btn-action-edit" onclick="addToLiveCart('${p.id}')" ${isOutOfStock ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ""} style="width: 100%; font-size: 12px; padding: 5px 0; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 4px; cursor: pointer; background: var(--lacquer-4); color: var(--ink-hi); border: 1px solid var(--rule);">
                    <i class="fa-solid fa-plus"></i> ${isOutOfStock ? "Hết hàng" : "Thêm vào giỏ"}
                </button>
            </div>
        `;
    });
    grid.innerHTML = html;
}

window.addToLiveCart = function (prodId) {
    if (!prodId) return;
    const products = globalInventoryData?.products || [];
    const p = products.find((item) => item.id === prodId);
    if (!p) return;

    const stock =
        p.current_stock !== undefined
            ? p.current_stock
            : Math.max(0, (p.initial_stock || 0) - (p.sold_count || 0));
    if (stock <= 0) {
        alert(`Sản phẩm '${p.name}' đã hết hàng trong kho!`);
        return;
    }

    if (!liveCart[prodId]) {
        liveCart[prodId] = { product: p, quantity: 1 };
    } else {
        if (liveCart[prodId].quantity < stock) {
            liveCart[prodId].quantity += 1;
        } else {
            alert(
                `Đã đạt giới hạn tồn kho tối đa (${stock} ${p.unit}) của sản phẩm ${p.name}`,
            );
        }
    }
    renderLiveCart();
};

window.updateLiveCartQty = function (prodId, delta) {
    if (!liveCart[prodId]) return;
    const p = liveCart[prodId].product;
    const stock =
        p.current_stock !== undefined
            ? p.current_stock
            : Math.max(0, (p.initial_stock || 0) - (p.sold_count || 0));
    const newQty = liveCart[prodId].quantity + delta;

    if (delta > 0 && newQty > stock) {
        alert(
            `Không thể tăng quá số lượng tồn kho hiện có (${stock} ${p.unit})!`,
        );
        return;
    }

    liveCart[prodId].quantity = newQty;
    if (liveCart[prodId].quantity <= 0) {
        delete liveCart[prodId];
    }
    renderLiveCart();
};

function renderLiveCart() {
    const tbody = document.getElementById("liveCartTbody");
    const totalEl = document.getElementById("liveCartTotal");
    const totalItemsEl = document.getElementById("liveCartTotalItems");
    if (!tbody) return;

    const keys = Object.keys(liveCart);
    if (keys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--ink-dim); padding: 12px;">Giỏ hàng trống. Chọn sản phẩm ở trên để thêm.</td></tr>`;
        if (totalEl) totalEl.textContent = "0 ₫";
        if (totalItemsEl) totalItemsEl.textContent = "(0 món)";
        return;
    }

    let grandTotal = 0;
    let totalQty = 0;
    let html = "";
    keys.forEach((id) => {
        const item = liveCart[id];
        const lineTotal = item.product.price * item.quantity;
        grandTotal += lineTotal;
        totalQty += item.quantity;

        html += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 4px; color: #FFF; font-weight: 500;">${esc(item.product.name)}</td>
                <td style="padding: 4px; text-align: center;">
                    <button class="btn-action-sm" onclick="updateLiveCartQty('${id}', -1)" style="padding: 0 5px;">-</button>
                    <span style="margin: 0 4px; font-weight: 700;">${item.quantity}</span>
                    <button class="btn-action-sm" onclick="updateLiveCartQty('${id}', 1)" style="padding: 0 5px;">+</button>
                </td>
                <td style="padding: 4px; text-align: right; color: var(--ink-dim);">${formatVND(item.product.price)}</td>
                <td style="padding: 4px; text-align: right; color: var(--goldleaf); font-weight: 600;">${formatVND(lineTotal)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    if (totalEl) totalEl.textContent = formatVND(grandTotal);
    if (totalItemsEl) totalItemsEl.textContent = `(${totalQty} món)`;
}

async function handleCheckoutLivePOS() {
    const keys = Object.keys(liveCart);
    const msg = document.getElementById("livePOSMsg");
    if (keys.length === 0) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Giỏ hàng đang trống! Hãy chọn sản phẩm trước.";
        }
        return;
    }

    const seller =
        document.getElementById("livePOSSelectSeller")?.value || "Thu ngân ca";
    const note = document.getElementById("livePOSInputNote")?.value || "";
    const shiftId = currentSelectedLiveShiftId || "Live";
    const channelName = `Ca ${shiftId}`;

    if (msg) {
        msg.className = "swap-msg";
        msg.textContent = "Đang thanh toán và ghi nhận giao dịch...";
    }

    try {
        for (const id of keys) {
            const item = liveCart[id];
            await fetch("/api/inventory/sell", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_id: id,
                    quantity: item.quantity,
                    channel: channelName,
                    seller: seller,
                    note: note || `Bán hàng POS tại Ca-Live ${shiftId}`,
                }),
            });
        }

        liveCart = {};
        renderLiveCart();
        if (msg) {
            msg.className = "swap-msg success";
            msg.textContent =
                "✓ Thanh toán thành công! Doanh thu đã được cộng vào ca này.";
        }
        await loadInventoryData();
        renderLiveShiftSalesTable(shiftId);
        renderLivePOSProductGrid();
    } catch (e) {
        if (msg) {
            msg.className = "swap-msg error";
            msg.textContent = "Lỗi thanh toán: " + e.message;
        }
    }
}

function renderLiveShiftSalesTable(shiftId) {
    const tbody = document.getElementById("liveShiftSalesTableBody");
    const summaryEl = document.getElementById("liveShiftRevSummary");
    if (!tbody) return;

    const allSales = globalInventoryData?.sales_logs || [];
    const shiftSales = allSales.filter((l) =>
        (l.channel || "").includes(shiftId),
    );

    const totalRev = shiftSales.reduce(
        (acc, l) => acc + (l.refunded ? 0 : l.total_amount || 0),
        0,
    );
    if (summaryEl)
        summaryEl.textContent = `${formatVND(totalRev)} ca ${shiftId}`;

    if (shiftSales.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty">Chưa có giao dịch bán hàng nào trong ca ${shiftId}.</td></tr>`;
        return;
    }

    let html = "";
    shiftSales.forEach((l) => {
        const isRefunded = l.refunded === true;
        const rowStyle = isRefunded
            ? 'style="opacity: 0.5; text-decoration: line-through;"'
            : "";
        const refundStatus = isRefunded
            ? `<div style="color: #ef4444; font-size: 10px; font-weight: 600; margin-top:2px;"><i class="fa-solid fa-ban"></i> Đã hủy</div>`
            : "";
        const actionBtn = isRefunded
            ? `<span style="color: var(--ink-dim); font-size: 11px;"><i class="fa-solid fa-ban"></i> Đã hủy</span>`
            : `
            <button type="button" class="btn-action-sm btn-action-delete" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); padding: 3px 8px; font-size: 11px;" onclick="refundTransaction('${l.id}')" title="Hủy giao dịch">
                <i class="fa-solid fa-rotate-left"></i> Hủy
            </button>
        `;

        html += `
            <tr ${rowStyle}>
                <td class="cell-center mk-num"><strong>${l.id}</strong>${refundStatus}</td>
                <td class="cell-center mk-num">${l.timestamp}</td>
                <td><strong>${l.product_name}</strong></td>
                <td class="cell-center mk-num"><b>${l.quantity}</b> ${l.unit || "món"}</td>
                <td class="cell-right mk-num">${formatVND(l.unit_price)}</td>
                <td class="cell-right mk-num" style="color:${isRefunded ? "var(--ink-dim)" : "var(--goldleaf)"}; font-weight:700;">${formatVND(l.total_amount)}</td>
                <td><span class="mk-lead">${l.seller}</span></td>
                <td style="color:var(--ink-dim); font-size:12px;">${l.note || "-"}</td>
                <td class="cell-center">${actionBtn}</td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
}

async function handleUploadInventoryExcel(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await authFetch("/api/inventory/upload-excel", {
            method: "POST",
            body: formData,
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadInventoryData();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (err) {
        alert("Lỗi tải file: " + err.message);
    } finally {
        e.target.value = "";
    }
}

async function refundTransaction(txId) {
    if (
        !confirm(
            `Bạn có chắc chắn muốn HỦY & HOÀN TÁC giao dịch ${txId} này?\nSố lượng sản phẩm tương ứng sẽ được hoàn lại vào kho hàng.`,
        )
    ) {
        return;
    }

    try {
        const res = await fetch("/api/inventory/refund", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ transaction_id: txId }),
        });
        const data = await res.json();
        if (data.success) {
            alert(data.message);
            loadInventoryData();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (e) {
        alert("Lỗi khi hủy giao dịch: " + e.message);
    }
}

// Edit member modal logic
function openEditMemberModal(memberId) {
    if (currentUserRole !== "admin") {
        openAdminLoginModal(
            "Bạn cần đăng nhập quyền Quản trị viên để chỉnh sửa thông tin hoặc lịch rảnh thành viên!",
        );
        return;
    }
    const member = globalMembers.find((m) => m.member_id === memberId);
    if (!member) {
        alert("Không tìm thấy thông tin thành viên " + memberId);
        return;
    }

    document.getElementById("editMemberId").value = member.member_id;
    document.getElementById("editMemberName").value = member.name || "";
    document.getElementById("editMemberDept").value = member.department || "";
    document.getElementById("editMemberJob").value = member.job || "";
    document.getElementById("editMemberPhone").value = member.phone || "";
    document.getElementById("editMemberStandby").checked = !!member.is_standby;

    const days = [
        "Thứ 2",
        "Thứ 3",
        "Thứ 4",
        "Thứ 5",
        "Thứ 6",
        "Thứ 7",
        "Chủ Nhật",
    ];
    const slots = [
        "07h00 - 09h30",
        "09h35 - 12h00",
        "12h05 - 14h00",
        "14h05 - 16h05",
        "16h10 - 18h00",
    ];

    const tbody = document.getElementById("editMemberScheduleBody");
    let html = "";

    days.forEach((day) => {
        html += `<tr>`;
        html += `<td style="font-weight: 600; padding: 8px;">${day}</td>`;
        slots.forEach((slot) => {
            const key = `${day}|${slot}`;
            const isFree =
                member.availability && member.availability[key] === true;
            const isCommit =
                member.committed_slots && member.committed_slots[key] === true;

            html += `
                <td style="text-align: center; padding: 8px; vertical-align: middle;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center;">
                        <label style="font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer; margin: 0;">
                            <input type="checkbox" class="chk-avail" data-day="${day}" data-slot="${slot}" ${isFree ? "checked" : ""} onchange="onAvailChange(this)" />
                            Rảnh
                        </label>
                        <label style="font-size: 11px; display: flex; align-items: center; gap: 3px; cursor: pointer; color: var(--goldleaf); margin: 0;">
                            <input type="checkbox" class="chk-commit" data-day="${day}" data-slot="${slot}" ${isCommit ? "checked" : ""} onchange="onCommitChange(this)" />
                            C.Kết
                        </label>
                    </div>
                </td>
            `;
        });
        html += `</tr>`;
    });

    tbody.innerHTML = html;
    document.getElementById("editMemberModal").classList.add("active");
}

function onAvailChange(el) {
    if (!el.checked) {
        // If unchecking available, also uncheck committed
        const td = el.closest("td");
        const commitChk = td.querySelector(".chk-commit");
        if (commitChk) commitChk.checked = false;
    }
}

function onCommitChange(el) {
    if (el.checked) {
        // If checking committed, also check available
        const td = el.closest("td");
        const availChk = td.querySelector(".chk-avail");
        if (availChk) availChk.checked = true;
    }
}

function closeMemberModal() {
    document.getElementById("editMemberModal").classList.remove("active");
}

// Bind modal close buttons
document.addEventListener("DOMContentLoaded", () => {
    const btnClose = document.getElementById("btnCloseMemberModal");
    const btnCancel = document.getElementById("btnCancelMemberModal");
    const btnSave = document.getElementById("btnSaveMemberModal");

    if (btnClose) btnClose.addEventListener("click", closeMemberModal);
    if (btnCancel) btnCancel.addEventListener("click", closeMemberModal);
    if (btnSave) btnSave.addEventListener("click", saveMemberData);
});

async function saveMemberData() {
    const memberId = document.getElementById("editMemberId").value;
    const name = document.getElementById("editMemberName").value.trim();
    const department = document.getElementById("editMemberDept").value.trim();
    const job = document.getElementById("editMemberJob").value.trim();
    const phone = document.getElementById("editMemberPhone").value.trim();
    const is_standby = document.getElementById("editMemberStandby").checked;

    if (!name || !department) {
        alert("Vui lòng điền đầy đủ Họ tên và Ban.");
        return;
    }

    const availability = {};
    const committed_slots = {};

    document.querySelectorAll(".chk-avail").forEach((el) => {
        const day = el.getAttribute("data-day");
        const slot = el.getAttribute("data-slot");
        availability[`${day}|${slot}`] = el.checked;
    });

    document.querySelectorAll(".chk-commit").forEach((el) => {
        const day = el.getAttribute("data-day");
        const slot = el.getAttribute("data-slot");
        committed_slots[`${day}|${slot}`] = el.checked;
    });

    const btnSave = document.getElementById("btnSaveMemberModal");
    const originalText = btnSave.textContent;
    btnSave.textContent = "Đang lưu...";
    btnSave.disabled = true;

    try {
        const res = await authFetch("/api/members/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                member_id: memberId,
                name,
                department,
                job,
                phone,
                is_standby,
                availability,
                committed_slots,
            }),
        });

        const data = await res.json();
        if (data.success) {
            alert(data.message);
            closeMemberModal();

            // Reload members list & refresh schedule/UI
            const resMembers = await fetch("/api/members").then((r) =>
                r.json(),
            );
            if (resMembers.success) {
                globalMembers = resMembers.members;
            }

            // Reload schedule to update KPI & members stats
            const resSched = await fetch("/api/schedule/current").then((r) =>
                r.json(),
            );
            if (resSched.success) {
                globalScheduleData = resSched.result;
            }

            populateUI();
        } else {
            alert("Lỗi: " + data.message);
        }
    } catch (err) {
        alert("Lỗi khi lưu thông tin thành viên: " + err.message);
    } finally {
        btnSave.textContent = originalText;
        btnSave.disabled = false;
    }
}

// ==========================================
// 12. KPI FUNCTIONS
// ==========================================
let globalKpiAttendance = [];

async function loadKpiData() {
    const tableBody = document.getElementById("kpiAttendanceTableBody");
    const leaderboardBody = document.getElementById("kpiLeaderboardTableBody");

    try {
        const res = await fetch("/api/kpi/attendance").then((r) => r.json());
        if (res.success) {
            globalKpiAttendance = res.attendance || [];
            renderKpiAll();
        } else {
            if (tableBody)
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--cinnabar);">Lỗi: ${res.message}</td></tr>`;
        }
    } catch (err) {
        console.error("Lỗi tải dữ liệu KPI:", err);
        if (tableBody)
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--cinnabar);">Không kết nối được server để tải KPI</td></tr>`;
    }
}

function renderKpiAll() {
    renderKpiStats();
    renderKpiAttendance();
    renderKpiLeaderboard();
}

function renderKpiStats() {
    const totalCount = globalKpiAttendance.length;
    const onTimeCount = globalKpiAttendance.filter(
        (l) => l.status === "Đúng giờ",
    ).length;
    const lateCount = globalKpiAttendance.filter(
        (l) => l.status === "Đi trễ",
    ).length;
    const absentCount = globalKpiAttendance.filter(
        (l) => l.status === "Nghỉ không phép",
    ).length;

    const onTimeRate =
        totalCount > 0 ? Math.round((onTimeCount / totalCount) * 100) : 100;

    const totalEl = document.getElementById("kpiStatTotal");
    const rateEl = document.getElementById("kpiStatOnTimeRate");
    const lateEl = document.getElementById("kpiStatLate");
    const absentEl = document.getElementById("kpiStatAbsent");

    if (totalEl) totalEl.textContent = String(totalCount);
    if (rateEl) rateEl.textContent = onTimeRate + "%";
    if (lateEl) lateEl.textContent = String(lateCount);
    if (absentEl) absentEl.textContent = String(absentCount);
}

function renderKpiAttendance() {
    const tbody = document.getElementById("kpiAttendanceTableBody");
    if (!tbody) return;

    const searchInp = document.getElementById("kpiShiftSearchInput");
    const query = searchInp ? searchInp.value.toLowerCase().trim() : "";

    const filtered = globalKpiAttendance.filter((log) => {
        if (!query) return true;
        return (
            (log.name || "").toLowerCase().includes(query) ||
            (log.day || "").toLowerCase().includes(query) ||
            (log.slot || "").toLowerCase().includes(query) ||
            (log.type || "").toLowerCase().includes(query) ||
            (log.role || "").toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--ink-dim); padding: 2rem;">Không tìm thấy ca trực nào khớp bộ lọc.</td></tr>`;
        return;
    }

    let html = "";
    filtered.forEach((log) => {
        const typeTag =
            log.type === "Ngoại"
                ? `<span class="badge" style="background: rgba(14, 116, 144, 0.1); color: var(--blue-accent); font-weight: 600; padding: 2px 6px; border-radius: 4px;">Ca Ngoài</span>`
                : `<span class="badge" style="background: rgba(13, 148, 136, 0.1); color: #0d9488; font-weight: 600; padding: 2px 6px; border-radius: 4px;">Phòng</span>`;

        const roleTag =
            log.role === "Chính"
                ? `<span class="text-xs" style="color: var(--blue-accent); font-weight: 500;"><i class="fa-solid fa-star"></i> Trực Chính</span>`
                : `<span class="text-xs" style="color: var(--ink-dim); font-weight: 400;"><i class="fa-solid fa-circle-user"></i> Dự Phòng</span>`;

        // Setup dropdown dynamic coloring
        let selectClass = "select-green";
        if (log.status === "Đi trễ") selectClass = "select-orange";
        else if (log.status === "Nghỉ có phép") selectClass = "select-blue";
        else if (log.status === "Nghỉ không phép") selectClass = "select-red";
        else if (log.status === "Ứng biến standby")
            selectClass = "select-purple";

        html += `
            <tr style="transition: background-color 0.2s;">
                <td style="font-weight: 600; color: var(--ink-main);">${log.day}</td>
                <td><code style="background: var(--bg-card-alt); padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; color: var(--goldleaf); font-weight: 500;">${log.slot}</code></td>
                <td>${typeTag}</td>
                <td style="font-weight: 500; color: var(--ink-main);">${log.name}</td>
                <td>${roleTag}</td>
                <td>
                    <select class="custom-select ${selectClass}" 
                            style="padding: 6px 12px; font-size: 13px; border-radius: 6px; font-weight: 600; border: 1px solid var(--border-color); cursor: pointer; transition: all 0.2s; outline: none; width: 100%;" 
                            onchange="updateKpiStatus('${log.shift_id}', '${log.member_id}', this.value, this)">
                        <option value="Đúng giờ" ${log.status === "Đúng giờ" ? "selected" : ""}>Đúng giờ (+10)</option>
                        <option value="Đi trễ" ${log.status === "Đi trễ" ? "selected" : ""}>Đi trễ (+5)</option>
                        <option value="Nghỉ có phép" ${log.status === "Nghỉ có phép" ? "selected" : ""}>Nghỉ có phép (+3)</option>
                        <option value="Nghỉ không phép" ${log.status === "Nghỉ không phép" ? "selected" : ""}>Nghỉ không phép (-15)</option>
                        <option value="Ứng biến standby" ${log.status === "Ứng biến standby" ? "selected" : ""}>Ứng cứu Standby (+15)</option>
                    </select>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function updateKpiStatus(shiftId, memberId, newStatus, selectElement) {
    if (selectElement) {
        selectElement.style.opacity = "0.5";
        selectElement.disabled = true;
    }

    try {
        const res = await fetch("/api/kpi/attendance", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                shift_id: shiftId,
                member_id: memberId,
                status: newStatus,
            }),
        }).then((r) => r.json());

        if (res.success) {
            // Update local memory
            const log = globalKpiAttendance.find(
                (l) => l.shift_id === shiftId && l.member_id === memberId,
            );
            if (log) {
                log.status = newStatus;
            }

            // Recalculate stats and leaderboard
            renderKpiStats();
            renderKpiLeaderboard();

            // Highlight the select control with the correct class
            if (selectElement) {
                selectElement.className = "custom-select";
                let selectClass = "select-green";
                if (newStatus === "Đi trễ") selectClass = "select-orange";
                else if (newStatus === "Nghỉ có phép")
                    selectClass = "select-blue";
                else if (newStatus === "Nghỉ không phép")
                    selectClass = "select-red";
                else if (newStatus === "Ứng biến standby")
                    selectClass = "select-purple";
                selectElement.classList.add(selectClass);
            }
        } else {
            alert("Lỗi khi lưu trạng thái: " + res.message);
        }
    } catch (err) {
        console.error("Lỗi kết nối điểm danh:", err);
    } finally {
        if (selectElement) {
            selectElement.style.opacity = "1";
            selectElement.disabled = false;
        }
    }
}

function renderKpiLeaderboard() {
    const tbody = document.getElementById("kpiLeaderboardTableBody");
    if (!tbody || !globalScheduleData) return;

    const searchInp = document.getElementById("kpiMemberSearchInput");
    const query = searchInp ? searchInp.value.toLowerCase().trim() : "";

    // Group attendance logs by member_id
    const memberLogs = {};
    globalKpiAttendance.forEach((log) => {
        if (!memberLogs[log.member_id]) {
            memberLogs[log.member_id] = [];
        }
        memberLogs[log.member_id].push(log);
    });

    // Build array of member performance
    const leaderboard = [];
    const allMembers = globalScheduleData.member_stats || [];

    allMembers.forEach((m) => {
        const mId = m.member_id;
        const logs = memberLogs[mId] || [];

        let onTime = 0;
        let late = 0;
        let excused = 0;
        let unexcused = 0;
        let standby = 0;

        logs.forEach((l) => {
            if (l.status === "Đúng giờ") onTime++;
            else if (l.status === "Đi trễ") late++;
            else if (l.status === "Nghỉ có phép") excused++;
            else if (l.status === "Nghỉ không phép") unexcused++;
            else if (l.status === "Ứng biến standby") standby++;
        });

        // Total scheduled ca
        const totalShifts = logs.filter(
            (l) => l.status !== "Ứng biến standby",
        ).length;

        // Compute score percentage
        let score = 100;
        const expectedPoints = totalShifts * 10;
        if (expectedPoints > 0 || standby > 0) {
            const earnedPoints =
                onTime * 10 +
                late * 5 +
                excused * 3 -
                unexcused * 15 +
                standby * 15;
            const expected = expectedPoints > 0 ? expectedPoints : 10;
            score = Math.max(
                0,
                Math.min(150, Math.round((earnedPoints / expected) * 100)),
            );
        }

        leaderboard.push({
            member_id: mId,
            name: m.name,
            department: m.department || "Ban Chuyên Môn",
            total_shifts: totalShifts,
            on_time: onTime,
            late: late,
            excused: excused,
            unexcused: unexcused,
            standby: standby,
            score: score,
        });
    });

    // Filter leaderboard
    const filtered = leaderboard.filter((item) => {
        if (!query) return true;
        return (
            (item.name || "").toLowerCase().includes(query) ||
            (item.department || "").toLowerCase().includes(query) ||
            (item.member_id || "").toLowerCase().includes(query)
        );
    });

    // Sort descending by score, then name
    filtered.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--ink-dim); padding: 2rem;">Không tìm thấy thành viên nào khớp bộ lọc.</td></tr>`;
        return;
    }

    let html = "";
    filtered.forEach((item, index) => {
        const rank = index + 1;
        let rankBadge = `<span style="font-weight:700; color: var(--ink-dim);">${rank}</span>`;
        if (rank === 1)
            rankBadge = `🏆 <span style="font-weight:800; color: #d97706;">1</span>`;
        else if (rank === 2)
            rankBadge = `🥈 <span style="font-weight:800; color: #4b5563;">2</span>`;
        else if (rank === 3)
            rankBadge = `🥉 <span style="font-weight:800; color: #b45309;">3</span>`;

        // Define rating badge
        let ratingBadge = "";
        if (item.score >= 100) {
            ratingBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #d97706; font-weight:700; padding: 4px 8px; border-radius: 20px; font-size:11px;"><i class="fa-solid fa-medal"></i> Xuất Sắc</span>`;
        } else if (item.score >= 80) {
            ratingBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.1); color: #059669; font-weight:700; padding: 4px 8px; border-radius: 20px; font-size:11px;"><i class="fa-solid fa-circle-check"></i> Đạt Chuẩn</span>`;
        } else if (item.score >= 50) {
            ratingBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #d97706; font-weight:600; padding: 4px 8px; border-radius: 20px; font-size:11px;"><i class="fa-solid fa-circle-minus"></i> Khá / TB</span>`;
        } else {
            ratingBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: #dc2626; font-weight:700; padding: 4px 8px; border-radius: 20px; font-size:11px;"><i class="fa-solid fa-triangle-exclamation"></i> Cảnh Báo</span>`;
        }

        const detailsText = `Đúng giờ: ${item.on_time} | Trễ: ${item.late} | Phép: ${item.excused} | Không phép: ${item.unexcused} | Ứng cứu: ${item.standby}`;

        // Score color and progress bar width
        let barColor = "#10b981";
        if (item.score < 50) barColor = "#ef4444";
        else if (item.score < 80) barColor = "#f59e0b";
        else if (item.score >= 100) barColor = "#8b5cf6";

        const scorePercent = Math.min(100, item.score);

        html += `
            <tr>
                <td style="text-align: center; width: 60px;">${rankBadge}</td>
                <td><code style="font-size: 0.85rem; color: var(--ink-dim);">${item.member_id}</code></td>
                <td style="font-weight: 600; color: var(--ink-main);">${item.name}</td>
                <td><span style="font-size:13px; font-weight:500; color: var(--ink-dim);">${item.department}</span></td>
                <td><b style="color: var(--ink-main);">${item.total_shifts}</b> ca</td>
                <td>
                    <span style="font-size: 11px; color: var(--ink-dim); display: block;" title="${detailsText}">
                        <span style="color:#10b981; font-weight:600;">${item.on_time}đg</span> • 
                        <span style="color:#f59e0b; font-weight:600;">${item.late}t</span> • 
                        <span style="color:#ef4444; font-weight:600;">${item.unexcused}kp</span> • 
                        <span style="color:#8b5cf6; font-weight:600;">+${item.standby}ứ</span>
                    </span>
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-weight: 700; width: 40px; color: ${barColor}; text-align: right;">${item.score}%</span>
                        <div style="flex-grow: 1; background: var(--bg-card-alt); border-radius: 4px; height: 6px; overflow: hidden; width: 80px; border: 1px solid var(--border-color);">
                            <div style="background: ${barColor}; width: ${scorePercent}%; height: 100%; border-radius: 4px;"></div>
                        </div>
                    </div>
                </td>
                <td>${ratingBadge}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

function exportKpiReportCSV() {
    if (!globalScheduleData) return;

    const memberLogs = {};
    globalKpiAttendance.forEach((log) => {
        if (!memberLogs[log.member_id]) memberLogs[log.member_id] = [];
        memberLogs[log.member_id].push(log);
    });

    const allMembers = globalScheduleData.member_stats || [];
    const rows = [
        ["BÁO CÁO HIỆU SUẤT KPI CHUYÊN CẦN THÀNH VIÊN - BAN NHÂN SỰ"],
        ["Ngày xuất", new Date().toLocaleString("vi-VN")],
        [],
        [
            "Hạng",
            "Mã Thành Viên",
            "Thành Viên",
            "Ban Chuyên Môn",
            "Tổng Ca Phân Công",
            "Số Ca Đúng Giờ",
            "Số Ca Đi Trễ",
            "Nghỉ Có Phép",
            "Vắng Không Phép",
            "Số Ca Ứng Cứu Standby",
            "Điểm Số KPI (%)",
            "Xếp Loại Hiệu Suất",
        ],
    ];

    const leaderboard = [];
    allMembers.forEach((m) => {
        const mId = m.member_id;
        const logs = memberLogs[mId] || [];

        let onTime = 0,
            late = 0,
            excused = 0,
            unexcused = 0,
            standby = 0;
        logs.forEach((l) => {
            if (l.status === "Đúng giờ") onTime++;
            else if (l.status === "Đi trễ") late++;
            else if (l.status === "Nghỉ có phép") excused++;
            else if (l.status === "Nghỉ không phép") unexcused++;
            else if (l.status === "Ứng biến standby") standby++;
        });

        const totalShifts = logs.filter(
            (l) => l.status !== "Ứng biến standby",
        ).length;
        let score = 100;
        const expectedPoints = totalShifts * 10;
        if (expectedPoints > 0 || standby > 0) {
            const earnedPoints =
                onTime * 10 +
                late * 5 +
                excused * 3 -
                unexcused * 15 +
                standby * 15;
            const expected = expectedPoints > 0 ? expectedPoints : 10;
            score = Math.max(
                0,
                Math.min(150, Math.round((earnedPoints / expected) * 100)),
            );
        }

        leaderboard.push({
            member_id: mId,
            name: m.name,
            department: m.department || "",
            total_shifts: totalShifts,
            on_time: onTime,
            late: late,
            excused: excused,
            unexcused: unexcused,
            standby: standby,
            score: score,
        });
    });

    leaderboard.sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
    );

    leaderboard.forEach((item, index) => {
        let rating = "Xuất sắc";
        if (item.score < 50) rating = "Cảnh báo vi phạm";
        else if (item.score < 80) rating = "Khá / Trung bình";
        else if (item.score < 100) rating = "Đạt chuẩn";

        rows.push([
            index + 1,
            item.member_id,
            item.name,
            item.department,
            item.total_shifts,
            item.on_time,
            item.late,
            item.excused,
            item.unexcused,
            item.standby,
            item.score + "%",
            rating,
        ]);
    });

    const csvContent =
        "\uFEFF" +
        rows
            .map((e) =>
                e
                    .map((val) => `"${String(val).replace(/"/g, '""')}"`)
                    .join(","),
            )
            .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
        "download",
        `Bao_Cao_KPI_Chuyen_Can_${new Date().toISOString().slice(0, 10)}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
