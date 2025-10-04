// Admin Panel Application
class AdminApp {
    constructor() {
        this.tenants = [];
        this.isSuperAdmin = false;
        this.init();
    }
    
    init() {
        this.checkAuthentication();
        this.setupEventListeners();
        this.loadTheme();
        this.loadData();
    }
    
    // Authentication
    checkAuthentication() {
        const token = localStorage.getItem('access_token');
        const role = localStorage.getItem('role');
        
        // Allow both admin and super_admin
        if (!token || !['admin', 'super_admin'].includes(role)) {
            window.location.href = '/login';
            return;
        }
        
        // Check if super admin
        this.isSuperAdmin = (role === 'super_admin');
    }
    
    getAuthHeaders() {
        const token = localStorage.getItem('access_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }
    
    // Theme Management
    loadTheme() {
        const theme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        this.updateThemeIcon(theme);
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    }
    
    updateThemeIcon(theme) {
        const icon = document.querySelector('#themeToggle i');
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
    
    // Event Listeners
    setupEventListeners() {
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        
        // Tab change listeners
        document.querySelectorAll('[data-bs-toggle="pill"]').forEach(tab => {
            tab.addEventListener('shown.bs.tab', (e) => {
                const target = e.target.getAttribute('data-bs-target');
                if (target === '#users') {
                    this.loadUsers();
                } else if (target === '#tenants') {
                    this.loadTenants();
                }
            });
        });
    }
    
    async logout() {
        if (confirm('Are you sure you want to logout?')) {
            try {
                await fetch('/api/logout', {
                    method: 'POST',
                    headers: this.getAuthHeaders()
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
            
            localStorage.removeItem('access_token');
            localStorage.removeItem('username');
            localStorage.removeItem('name');
            localStorage.removeItem('role');
            localStorage.removeItem('tenant_id');
            
            document.cookie = 'access_token=; path=/; max-age=0';
            window.location.href = '/login';
        }
    }
    
    // Load Data
    async loadData() {
        // Show/hide Tenants tab based on role
        if (this.isSuperAdmin) {
            document.getElementById('tenantsTabButton').style.display = 'block';
            await this.loadTenantsList();
        } else {
            document.getElementById('tenantsTabButton').style.display = 'none';
        }
        
        await this.loadOverview();
        await this.loadUsers();
    }
    
    async loadTenantsList() {
        try {
            const response = await fetch('/api/admin/tenants', { headers: this.getAuthHeaders() });
            
            if (response.ok) {
                const data = await response.json();
                this.tenants = data.tenants || [];
            } else {
                // If super admin, show error; if regular admin, just skip
                if (this.isSuperAdmin) {
                    console.error('Failed to load tenants');
                }
            }
        } catch (error) {
            console.error('Error loading tenants:', error);
        }
    }
    
    getTenantName(tenantId) {
        const tenant = this.tenants.find(t => t.id === tenantId);
        return tenant ? tenant.name : tenantId || 'N/A';
    }
    
    async loadOverview() {
        try {
            const [usersRes, tenantsRes] = await Promise.all([
                fetch('/api/admin/users', { headers: this.getAuthHeaders() }),
                fetch('/api/admin/tenants', { headers: this.getAuthHeaders() })
            ]);
            
            const usersData = await usersRes.json();
            const tenantsData = await tenantsRes.json();
            
            const users = usersData.users || [];
            const tenants = tenantsData.tenants || [];
            
            document.getElementById('totalUsers').textContent = users.length;
            document.getElementById('activeUsers').textContent = users.filter(u => u.status === 'active').length;
            document.getElementById('totalTenants').textContent = tenants.length;
        } catch (error) {
            console.error('Error loading overview:', error);
            this.showToast('Failed to load overview data', 'danger');
        }
    }
    
    // User Management
    async loadUsers() {
        try {
            const response = await fetch('/api/admin/users', { headers: this.getAuthHeaders() });
            
            if (!response.ok) {
                throw new Error('Failed to load users');
            }
            
            const data = await response.json();
            const users = data.users || [];
            
            // Update table headers if super admin
            const thead = document.getElementById('usersTableHead');
            if (this.isSuperAdmin) {
                thead.innerHTML = `
                    <tr>
                        <th>Username</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Tenant</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                `;
            } else {
                thead.innerHTML = `
                    <tr>
                        <th>Username</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                `;
            }
            
            const tbody = document.getElementById('usersTableBody');
            const colspanCount = this.isSuperAdmin ? 8 : 7;
            
            if (users.length === 0) {
                tbody.innerHTML = `<tr><td colspan="${colspanCount}" class="text-center">No users found</td></tr>`;
                return;
            }
            
            tbody.innerHTML = users.map(user => {
                // Show tenant column for super admin
                const tenantCell = this.isSuperAdmin ? 
                    `<td><span class="badge bg-info">${this.escapeHtml(this.getTenantName(user.tenant_id))}</span></td>` : '';
                
                // Show role badge with different colors
                let roleBadge = 'secondary';
                if (user.role === 'super_admin') roleBadge = 'danger';
                else if (user.role === 'admin') roleBadge = 'primary';
                
                return `
                    <tr>
                        <td>${this.escapeHtml(user.username)}</td>
                        <td>${this.escapeHtml(user.name || '')}</td>
                        <td>${this.escapeHtml(user.email || '')}</td>
                        ${tenantCell}
                        <td><span class="badge bg-${roleBadge}">${user.role}</span></td>
                        <td><span class="badge bg-${user.status === 'active' ? 'success' : 'warning'}">${user.status}</span></td>
                        <td>${new Date(user.created_at).toLocaleDateString()}</td>
                        <td class="table-actions">
                            <button class="btn btn-sm btn-outline-primary" onclick="adminApp.editUser('${this.escapeHtml(user.username)}')">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="adminApp.deleteUser('${this.escapeHtml(user.username)}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error loading users:', error);
            this.showToast('Failed to load users', 'danger');
        }
    }
    
    showUserModal(editMode = false) {
        const modal = new bootstrap.Modal(document.getElementById('userModal'));
        
        // Reset form
        document.getElementById('userEditMode').value = editMode ? 'edit' : 'create';
        document.getElementById('userEditUsername').value = '';
        document.getElementById('userUsername').value = '';
        document.getElementById('userName').value = '';
        document.getElementById('userEmail').value = '';
        document.getElementById('userPassword').value = '';
        document.getElementById('userRole').value = 'user';
        document.getElementById('userStatus').value = 'active';
        
        // Update modal title and password field
        document.getElementById('userModalTitle').textContent = editMode ? 'Edit User' : 'Add User';
        document.getElementById('userUsername').disabled = editMode;
        document.getElementById('passwordRequired').style.display = editMode ? 'none' : 'inline';
        document.getElementById('passwordHelp').style.display = editMode ? 'block' : 'none';
        document.getElementById('userPassword').required = !editMode;
        
        // Show/hide tenant selector and super admin option
        const tenantSelectGroup = document.getElementById('tenantSelectGroup');
        const superAdminOption = document.getElementById('superAdminOption');
        
        if (this.isSuperAdmin) {
            // Show tenant selector
            tenantSelectGroup.style.display = 'block';
            this.populateTenantSelector();
            
            // Show super admin role option
            superAdminOption.style.display = 'block';
        } else {
            // Hide tenant selector
            tenantSelectGroup.style.display = 'none';
            
            // Hide super admin option
            superAdminOption.style.display = 'none';
        }
        
        modal.show();
    }
    
    populateTenantSelector() {
        const select = document.getElementById('userTenant');
        
        if (this.tenants.length === 0) {
            select.innerHTML = '<option value="">No tenants available</option>';
            return;
        }
        
        select.innerHTML = '<option value="">Select Tenant</option>' +
            this.tenants.map(tenant => 
                `<option value="${tenant.id}">${this.escapeHtml(tenant.name)}</option>`
            ).join('');
    }
    
    async editUser(username) {
        try {
            // Get current user data from table
            const response = await fetch('/api/admin/users', { headers: this.getAuthHeaders() });
            const data = await response.json();
            const user = data.users.find(u => u.username === username);
            
            if (!user) {
                this.showToast('User not found', 'danger');
                return;
            }
            
            // Show modal first (which resets the form)
            this.showUserModal(true);
            
            // Then populate form with user data
            document.getElementById('userEditMode').value = 'edit';
            document.getElementById('userEditUsername').value = user.username;
            document.getElementById('userUsername').value = user.username;
            document.getElementById('userName').value = user.name || '';
            document.getElementById('userEmail').value = user.email || '';
            document.getElementById('userPassword').value = '';
            document.getElementById('userRole').value = user.role || 'user';
            document.getElementById('userStatus').value = user.status || 'active';
            
            // Set tenant if super admin
            if (this.isSuperAdmin) {
                document.getElementById('userTenant').value = user.tenant_id || '';
            }
        } catch (error) {
            console.error('Error loading user:', error);
            this.showToast('Failed to load user data', 'danger');
        }
    }
    
    async saveUser() {
        const editMode = document.getElementById('userEditMode').value === 'edit';
        const username = document.getElementById('userUsername').value.trim();
        const name = document.getElementById('userName').value.trim();
        const email = document.getElementById('userEmail').value.trim();
        const password = document.getElementById('userPassword').value;
        const role = document.getElementById('userRole').value;
        const status = document.getElementById('userStatus').value;
        
        // Validation
        if (!username || !name) {
            this.showToast('Username and name are required', 'warning');
            return;
        }
        
        if (!editMode && !password) {
            this.showToast('Password is required for new users', 'warning');
            return;
        }
        
        // Validate username in edit mode
        const editUsername = document.getElementById('userEditUsername').value;
        if (editMode && !editUsername) {
            this.showToast('Username is missing. Please try again.', 'danger');
            console.error('Edit mode but username is missing');
            return;
        }
        
        // Validate tenant selection for super admin
        let tenantId = null;
        if (this.isSuperAdmin) {
            tenantId = document.getElementById('userTenant').value;
            if (!tenantId && !editMode) {
                this.showToast('Please select a tenant', 'warning');
                return;
            }
        }
        
        try {
            const userData = {
                name,
                email,
                role,
                status
            };
            
            // Add tenant_id for super admin
            if (this.isSuperAdmin && tenantId) {
                userData.tenant_id = tenantId;
            }
            
            if (!editMode) {
                userData.username = username;
                userData.password = password;
            } else if (password) {
                userData.password = password;
            }
            
            const url = editMode 
                ? `/api/admin/users/${editUsername}`
                : '/api/admin/users';
            
            const method = editMode ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: this.getAuthHeaders(),
                body: JSON.stringify(userData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save user');
            }
            
            bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
            this.showToast(editMode ? 'User updated successfully' : 'User created successfully', 'success');
            await this.loadUsers();
            await this.loadOverview();
        } catch (error) {
            console.error('Error saving user:', error);
            this.showToast(error.message || 'Failed to save user', 'danger');
        }
    }
    
    async deleteUser(username) {
        if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/users/${username}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete user');
            }
            
            this.showToast('User deleted successfully', 'success');
            await this.loadUsers();
            await this.loadOverview();
        } catch (error) {
            console.error('Error deleting user:', error);
            this.showToast(error.message || 'Failed to delete user', 'danger');
        }
    }
    
    // Tenant Management
    async loadTenants() {
        try {
            const response = await fetch('/api/admin/tenants', { headers: this.getAuthHeaders() });
            
            if (!response.ok) {
                throw new Error('Failed to load tenants');
            }
            
            const data = await response.json();
            const tenants = data.tenants || [];
            
            const tbody = document.getElementById('tenantsTableBody');
            
            if (tenants.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center">No tenants found</td></tr>';
                return;
            }
            
            tbody.innerHTML = tenants.map(tenant => `
                <tr>
                    <td>${this.escapeHtml(tenant.name)}</td>
                    <td>${this.escapeHtml(tenant.contact_email || '')}</td>
                    <td>${tenant.max_users}</td>
                    <td><span class="badge bg-${tenant.status === 'active' ? 'success' : 'warning'}">${tenant.status}</span></td>
                    <td>${new Date(tenant.created_at).toLocaleDateString()}</td>
                    <td class="table-actions">
                        <button class="btn btn-sm btn-outline-primary" onclick="adminApp.editTenant('${tenant.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="adminApp.deleteTenant('${tenant.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error loading tenants:', error);
            this.showToast('Failed to load tenants', 'danger');
        }
    }
    
    showTenantModal(editMode = false) {
        const modal = new bootstrap.Modal(document.getElementById('tenantModal'));
        
        // Reset form
        document.getElementById('tenantEditMode').value = editMode ? 'edit' : 'create';
        document.getElementById('tenantEditId').value = '';
        document.getElementById('tenantName').value = '';
        document.getElementById('tenantEmail').value = '';
        document.getElementById('tenantMaxUsers').value = '50';
        document.getElementById('tenantStatus').value = 'active';
        
        document.getElementById('tenantModalTitle').textContent = editMode ? 'Edit Tenant' : 'Add Tenant';
        
        modal.show();
    }
    
    async editTenant(tenantId) {
        try {
            const response = await fetch('/api/admin/tenants', { headers: this.getAuthHeaders() });
            const data = await response.json();
            const tenant = data.tenants.find(t => t.id === tenantId);
            
            if (!tenant) {
                this.showToast('Tenant not found', 'danger');
                return;
            }
            
            // Show modal first (which resets the form)
            this.showTenantModal(true);
            
            // Then populate with tenant data
            document.getElementById('tenantEditMode').value = 'edit';
            document.getElementById('tenantEditId').value = tenant.id;
            document.getElementById('tenantName').value = tenant.name;
            document.getElementById('tenantEmail').value = tenant.contact_email || '';
            document.getElementById('tenantMaxUsers').value = tenant.max_users;
            document.getElementById('tenantStatus').value = tenant.status;
        } catch (error) {
            console.error('Error loading tenant:', error);
            this.showToast('Failed to load tenant data', 'danger');
        }
    }
    
    async saveTenant() {
        const editMode = document.getElementById('tenantEditMode').value === 'edit';
        const name = document.getElementById('tenantName').value.trim();
        const email = document.getElementById('tenantEmail').value.trim();
        const maxUsers = parseInt(document.getElementById('tenantMaxUsers').value);
        const status = document.getElementById('tenantStatus').value;
        
        if (!name) {
            this.showToast('Tenant name is required', 'warning');
            return;
        }
        
        // Validate tenant ID in edit mode
        const tenantId = document.getElementById('tenantEditId').value;
        if (editMode && !tenantId) {
            this.showToast('Tenant ID is missing. Please try again.', 'danger');
            console.error('Edit mode but tenant ID is missing');
            return;
        }
        
        try {
            const tenantData = {
                name,
                contact_email: email,
                max_users: maxUsers,
                status
            };
            
            const url = editMode 
                ? `/api/admin/tenants/${tenantId}`
                : '/api/admin/tenants';
            
            const method = editMode ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: this.getAuthHeaders(),
                body: JSON.stringify(tenantData)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save tenant');
            }
            
            bootstrap.Modal.getInstance(document.getElementById('tenantModal')).hide();
            this.showToast(editMode ? 'Tenant updated successfully' : 'Tenant created successfully', 'success');
            await this.loadTenants();
            await this.loadOverview();
        } catch (error) {
            console.error('Error saving tenant:', error);
            this.showToast(error.message || 'Failed to save tenant', 'danger');
        }
    }
    
    async deleteTenant(tenantId) {
        if (!confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/admin/tenants/${tenantId}`, {
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to delete tenant');
            }
            
            this.showToast('Tenant deleted successfully', 'success');
            await this.loadTenants();
            await this.loadOverview();
        } catch (error) {
            console.error('Error deleting tenant:', error);
            this.showToast(error.message || 'Failed to delete tenant', 'danger');
        }
    }
    
    // Utilities
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text ? String(text).replace(/[&<>"']/g, m => map[m]) : '';
    }
    
    showToast(message, type = 'info') {
        const toastHtml = `
            <div class="toast align-items-center text-white bg-${type} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(container);
        }
        
        container.insertAdjacentHTML('beforeend', toastHtml);
        const toastEl = container.lastElementChild;
        const toast = new bootstrap.Toast(toastEl, { delay: 5000 });
        toast.show();
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    }
}

// Initialize admin app
let adminApp;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        adminApp = new AdminApp();
    });
} else {
    adminApp = new AdminApp();
}

