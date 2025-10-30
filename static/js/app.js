// Load Testing Application with Bootstrap
class LoadTestApp {
    constructor() {
        this.ws = null;
        this.currentSession = null;
        this.headers = [];
        this.bodyFields = [];
        this.validationRules = [];
        this.bodyType = 'json';
        this.isTestRunning = false;
        this.editingValidationIndex = null;
        this.currentConfigId = null;
        this.currentConfigName = null;
        this.hasUnsavedChanges = false;
        this.isLoadingConfig = false;
        this.testStartTime = null;
        this.clockInterval = null;
        this.totalRequestsInTest = 0;
        this.completedRequestsCount = 0;
        this.realtimeResults = [];  // Store results as they come in
        this.currentHttpMethod = 'POST';  // Track current test's method
        this.currentSessionId = null;  // Track current test session
        this.availableTenants = [];  // Store user's available tenants
        this.selectedTenantId = null;  // Track selected tenant for filtering (no token change)
        
        // Chart instances
        this.charts = {
            responseTime: null,
            successRate: null,
            statusCode: null
        };
        
        this.init();
    }
    
    init() {
        this.checkAuthentication();
        this.connectWebSocket();
        this.setupEventListeners();
        this.loadTheme();
        this.setupBeforeUnloadWarning();
        this.setupChangeTracking();
        this.displayUserInfo();
        this.loadUserTenants();
    }
    
    // Authentication
    checkAuthentication() {
        const token = localStorage.getItem('access_token');
        if (!token) {
            window.location.href = '/login';
        }
    }
    
    getAuthHeaders() {
        const token = localStorage.getItem('access_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }
    
    displayUserInfo() {
        const name = localStorage.getItem('name') || localStorage.getItem('username') || 'User';
        const role = localStorage.getItem('role');
        const tenantName = localStorage.getItem('tenant_name') || 'Unknown';
        
        document.getElementById('userName').textContent = name;
        
        // Display current tenant
        document.getElementById('currentTenantName').textContent = tenantName;
        
        // Show admin link if user is admin or super_admin
        if (role === 'admin' || role === 'super_admin') {
            const logoutBtn = document.getElementById('logoutBtn');
            const adminLink = document.createElement('a');
            adminLink.href = '/admin';
            adminLink.className = 'btn btn-sm btn-outline-primary';
            adminLink.innerHTML = '<i class="fas fa-cog"></i> Admin Panel';
            logoutBtn.parentNode.insertBefore(adminLink, logoutBtn);
        }
    }
    
    async loadUserTenants() {
        try {
            // Fetch available tenants for current user
            const response = await fetch('/api/user/tenants', {
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) {
                console.error('Failed to load user tenants');
                return;
            }
            
            const data = await response.json();
            this.availableTenants = data.tenants || [];
            
            // Initialize selectedTenantId
            if (!this.selectedTenantId) {
                if (this.availableTenants.length > 0) {
                    // Find the current tenant (marked as is_current) or use the first one
                    const currentTenant = this.availableTenants.find(t => t.is_current);
                    this.selectedTenantId = currentTenant ? currentTenant.tenant_id : this.availableTenants[0].tenant_id;
                } else {
                    // No available tenants - fallback to token's tenant_id
                    const tokenTenantId = localStorage.getItem('tenant_id');
                    this.selectedTenantId = (tokenTenantId === '' || tokenTenantId === 'null') ? null : tokenTenantId;
                }
                console.log('[loadUserTenants] Initialized selectedTenantId to:', this.selectedTenantId);
            }
            
            // Show tenant switcher if user has access to tenants
            if (this.availableTenants.length > 1) {
                document.getElementById('tenantSwitcher').style.display = 'block';
                const tenantDropdown = document.getElementById('tenantDropdown');
                tenantDropdown.classList.add('dropdown-toggle');
                tenantDropdown.style.cursor = 'pointer';
                tenantDropdown.setAttribute('data-bs-toggle', 'dropdown');
                this.populateTenantDropdown();
            } else if (this.availableTenants.length === 1) {
                // Single tenant - just show the name (no dropdown needed)
                document.getElementById('tenantSwitcher').style.display = 'block';
                // Hide the dropdown arrow if only one tenant
                const tenantDropdown = document.getElementById('tenantDropdown');
                tenantDropdown.classList.remove('dropdown-toggle');
                tenantDropdown.style.cursor = 'default';
                tenantDropdown.removeAttribute('data-bs-toggle');
            }
        } catch (error) {
            console.error('Error loading tenants:', error);
        }
    }
    
    populateTenantDropdown() {
        const dropdownMenu = document.getElementById('tenantDropdownMenu');
        
        if (this.availableTenants.length === 0) {
            dropdownMenu.innerHTML = '<li><span class="dropdown-item-text text-muted small">No tenants available</span></li>';
            return;
        }
        
        // Build dropdown items
        const items = this.availableTenants.map(tenant => {
            const isSelected = tenant.tenant_id === this.selectedTenantId;
            const checkmark = isSelected ? '<i class="fas fa-check text-success me-2"></i>' : '<span class="me-4"></span>';
            const activeClass = isSelected ? 'active' : '';
            
            return `
                <li>
                    <a class="dropdown-item ${activeClass}" href="#" 
                       onclick="app.switchTenant('${tenant.tenant_id}', '${this.escapeHtml(tenant.tenant_name)}'); return false;">
                        ${checkmark}
                        ${this.escapeHtml(tenant.tenant_name)}
                        <small class="text-muted">(${tenant.role})</small>
                    </a>
                </li>
            `;
        }).join('');
        
        dropdownMenu.innerHTML = items;
    }
    
    async switchTenant(tenantId, tenantName) {
        // Don't switch if it's the already selected tenant
        if (tenantId === this.selectedTenantId) {
            this.showToast('This tenant is already selected', 'info');
            return;
        }
        
        // Update the selected tenant ID for filtering (no token creation)
        this.selectedTenantId = tenantId;
        
        // Update the dropdown display to show the selected tenant
        document.getElementById('currentTenantName').textContent = tenantName;
        
        // Update the dropdown items to show the checkmark on the selected tenant
        this.populateTenantDropdown();
        
        // Clear current configuration and start fresh (like newTest but without confirmation)
        this.clearConfigForTenantSwitch();
        
        this.showToast(`Switched to ${tenantName} - Ready for a new test!`, 'success');
    }
    
    clearConfigForTenantSwitch() {
        // Temporarily disable change tracking while clearing
        this.isLoadingConfig = true;
        
        // Clear all fields
        document.getElementById('apiUrl').value = '';
        document.getElementById('httpMethod').value = 'POST';
        
        // Clear headers
        this.headers = [];
        document.getElementById('headersList').innerHTML = '';
        
        // Clear body fields
        this.bodyFields = [];
        document.getElementById('bodyFieldsList').innerHTML = '';
        
        const rawBodyInput = document.getElementById('rawBodyInput');
        if (rawBodyInput) rawBodyInput.value = '';
        
        // Reset body type to JSON
        this.bodyType = 'json';
        document.querySelectorAll('[data-body-type]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.bodyType === 'json');
        });
        this.toggleBodySection();
        
        // Clear validation rules
        this.validationRules = [];
        this.renderValidationRules();
        
        // Clear load test settings
        const concurrentCalls = document.getElementById('concurrentCalls');
        const sequentialBatches = document.getElementById('sequentialBatches');
        const timeout = document.getElementById('timeout');
        const followRedirects = document.getElementById('followRedirects');
        const verifySSL = document.getElementById('verifySSL');
        
        if (concurrentCalls) concurrentCalls.value = '1';
        if (sequentialBatches) sequentialBatches.value = '';
        if (timeout) timeout.value = '600';
        if (followRedirects) followRedirects.checked = true;
        if (verifySSL) verifySSL.checked = false;
        
        // Clear results
        this.currentSession = null;
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            resultsSection.innerHTML = '<div class="text-center text-muted py-5">Run a test to see results here</div>';
        }
        
        // Hide stats, charts and progress
        const statsGrid = document.getElementById('statsGrid');
        const progressCard = document.getElementById('progressCard');
        const resultsTableContainer = document.getElementById('resultsTableContainer');
        const chartsSection = document.getElementById('chartsSection');
        if (statsGrid) statsGrid.style.display = 'none';
        if (progressCard) progressCard.style.display = 'none';
        if (resultsTableContainer) resultsTableContainer.style.display = 'none';
        if (chartsSection) chartsSection.style.display = 'none';
        
        // Destroy chart instances
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {
            responseTime: null,
            successRate: null,
            statusCode: null
        };
        
        // Clear config tracking
        this.currentConfigId = null;
        this.currentConfigName = null;
        this.hasUnsavedChanges = false;
        
        // Hide config name bar
        const configNameBar = document.getElementById('configNameBar');
        if (configNameBar) configNameBar.style.display = 'none';
        
        // Update empty states
        this.updateEmptyStates();
        
        // Re-enable change tracking
        this.isLoadingConfig = false;
    }
    
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
            
            // Clear local storage
            localStorage.removeItem('access_token');
            localStorage.removeItem('username');
            localStorage.removeItem('name');
            localStorage.removeItem('role');
            localStorage.removeItem('tenant_id');
            localStorage.removeItem('tenant_name');
            
            // Clear cookie
            document.cookie = 'access_token=; path=/; max-age=0';
            
            // Redirect to login
            window.location.href = '/login';
        }
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
        
        // Re-render charts with new theme colors if we have results
        if (this.currentSession) {
            this.renderCharts(this.currentSession);
        }
    }
    
    updateThemeIcon(theme) {
        const icon = document.querySelector('#themeToggle i');
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
    
    newTest() {
        // Check if there's anything to clear
        const hasApiUrl = document.getElementById('apiUrl').value.trim() !== '';
        const hasHeaders = this.headers.length > 0;
        const hasBodyFields = this.bodyFields.length > 0;
        const hasRawBody = document.getElementById('rawBodyInput')?.value.trim() !== '';
        const hasValidationRules = this.validationRules.length > 0;
        const hasLoadedConfig = this.currentConfigId !== null;
        const hasUnsavedChanges = this.hasUnsavedChanges;
        
        // Only show confirmation if there's something to clear
        const hasContent = hasApiUrl || hasHeaders || hasBodyFields || hasRawBody || 
                          hasValidationRules || hasLoadedConfig || hasUnsavedChanges;
        
        if (!hasContent) {
            // Nothing to clear, just show success message
            this.showToast('✨ Ready for a new test!', 'info');
            return;
        }
        
        // Show appropriate confirmation message
        let confirmMessage = 'Are you sure you want to clear all fields and start a new test?';
        if (hasLoadedConfig && hasUnsavedChanges) {
            confirmMessage = 'Close configuration? Any unsaved changes will be lost.\n\nAre you sure you want to start a new test?';
        }
        
        if (confirm(confirmMessage)) {
            // Temporarily disable change tracking while clearing
            this.isLoadingConfig = true;
            
            // Clear all fields
            document.getElementById('apiUrl').value = '';
            document.getElementById('httpMethod').value = 'POST';
            
            // Clear headers
            this.headers = [];
            document.getElementById('headersList').innerHTML = '';
            
            // Clear body fields
            this.bodyFields = [];
            document.getElementById('bodyFieldsList').innerHTML = '';
            
            const rawBodyInput = document.getElementById('rawBodyInput');
            if (rawBodyInput) rawBodyInput.value = '';
            
            // Reset body type to JSON
            this.bodyType = 'json';
            document.querySelectorAll('[data-body-type]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.bodyType === 'json');
            });
            this.toggleBodySection();
            
            // Clear validation rules
            this.validationRules = [];
            this.renderValidationRules();
            
            // Clear load test settings
            const concurrentCalls = document.getElementById('concurrentCalls');
            const sequentialBatches = document.getElementById('sequentialBatches');
            const timeout = document.getElementById('timeout');
            const followRedirects = document.getElementById('followRedirects');
            const verifySSL = document.getElementById('verifySSL');
            
            if (concurrentCalls) concurrentCalls.value = '1';
            if (sequentialBatches) sequentialBatches.value = '';
            if (timeout) timeout.value = '600';
            if (followRedirects) followRedirects.checked = true;
            if (verifySSL) verifySSL.checked = false;
            
            // Clear results
            this.currentSession = null;
            const resultsSection = document.getElementById('resultsSection');
            if (resultsSection) {
                resultsSection.innerHTML = '<div class="text-center text-muted py-5">Run a test to see results here</div>';
            }
            
            // Hide stats, charts and progress
            const statsGrid = document.getElementById('statsGrid');
            const progressCard = document.getElementById('progressCard');
            const resultsTableContainer = document.getElementById('resultsTableContainer');
            const chartsSection = document.getElementById('chartsSection');
            if (statsGrid) statsGrid.style.display = 'none';
            if (progressCard) progressCard.style.display = 'none';
            if (resultsTableContainer) resultsTableContainer.style.display = 'none';
            if (chartsSection) chartsSection.style.display = 'none';
            
            // Destroy chart instances
            Object.values(this.charts).forEach(chart => {
                if (chart) chart.destroy();
            });
            this.charts = {
                responseTime: null,
                successRate: null,
                statusCode: null
            };
            
            // Clear config tracking
            this.currentConfigId = null;
            this.currentConfigName = null;
            this.hasUnsavedChanges = false;
            
            // Hide config name bar
            const configNameBar = document.getElementById('configNameBar');
            if (configNameBar) configNameBar.style.display = 'none';
            
            // Update empty states
            this.updateEmptyStates();
            
            // Re-enable change tracking
            this.isLoadingConfig = false;
            
            this.showToast('✨ Ready for a new test!', 'success');
        }
    }
    
    // WebSocket
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        console.log('Connecting to WebSocket:', wsUrl);
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected successfully');
            const status = document.getElementById('connectionStatus');
            status.classList.add('connected');
            status.querySelector('.status-text').textContent = 'Connected';
        };
        
        this.ws.onclose = () => {
            const status = document.getElementById('connectionStatus');
            status.classList.remove('connected');
            status.querySelector('.status-text').textContent = 'Disconnected';
            setTimeout(() => this.connectWebSocket(), 3000);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message received:', data.type, data);
                this.handleWebSocketMessage(data);
            } catch (e) {
                console.error('WebSocket error:', e);
            }
        };
    }
    
    // Event Listeners
    setupEventListeners() {
        // Theme toggle
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => this.logout());
        
        // New Test
        document.getElementById('newTestBtn').addEventListener('click', () => this.newTest());
        
        // Headers
        document.getElementById('addHeaderBtn').addEventListener('click', () => this.addHeader());
        
        // Body type
        document.querySelectorAll('[data-body-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-body-type]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.bodyType = btn.dataset.bodyType;
                this.toggleBodySection();
            });
        });
        
        // Body fields
        document.getElementById('addBodyFieldBtn').addEventListener('click', () => this.addBodyField());
        document.getElementById('pasteJsonBtn').addEventListener('click', () => this.showPasteJsonModal());
        document.getElementById('validateJsonBtn').addEventListener('click', () => this.validateJson());
        document.getElementById('applyJsonBtn').addEventListener('click', () => this.applyPastedJson());
        
        // Validation
        document.getElementById('addValidationBtn').addEventListener('click', () => this.showValidationModal());
        document.getElementById('saveValidationBtn').addEventListener('click', () => this.saveValidationRule());
        document.getElementById('validationType').addEventListener('change', (e) => {
            document.getElementById('fieldPathGroup').style.display = e.target.value === 'json_path' ? 'block' : 'none';
        });
        
        // Test
        document.getElementById('runTestBtn').addEventListener('click', () => this.runTest());
        document.getElementById('cancelTestBtn').addEventListener('click', () => this.cancelTest());
        
        // Export
        document.getElementById('exportBtn').addEventListener('click', () => this.exportResults());
        
        // Config
        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfig());
        document.getElementById('loadConfigBtn').addEventListener('click', () => this.showLoadConfigModal());
        
        // Config Name Bar
        document.getElementById('editConfigNameBtn').addEventListener('click', () => this.enableConfigNameEdit());
        document.getElementById('saveConfigNameBtn').addEventListener('click', () => this.saveConfigName());
        document.getElementById('cancelConfigNameBtn').addEventListener('click', () => this.cancelConfigNameEdit());
        document.getElementById('configNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.saveConfigName();
            if (e.key === 'Escape') this.cancelConfigNameEdit();
        });
    }
    
    toggleBodySection() {
        const keyValueBody = document.getElementById('keyValueBody');
        const rawBody = document.getElementById('rawBody');
        
        if (this.bodyType === 'raw') {
            keyValueBody.style.display = 'none';
            rawBody.style.display = 'block';
        } else if (this.bodyType === 'none') {
            keyValueBody.style.display = 'none';
            rawBody.style.display = 'none';
        } else {
            keyValueBody.style.display = 'block';
            rawBody.style.display = 'none';
        }
        this.updateEmptyStates();
    }
    
    // Headers Management
    addHeader(key = '', value = '') {
        const index = this.headers.length;
        this.headers.push({ key, value });
        this.markAsChanged();
        
        const list = document.getElementById('headersList');
        const item = document.createElement('div');
        item.className = 'key-value-item';
        
        // Create elements properly to avoid HTML injection issues with special characters
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'form-control form-control-sm';
        keyInput.placeholder = 'Header name';
        keyInput.value = key; // This properly escapes the value
        keyInput.dataset.index = index;
        keyInput.dataset.field = 'key';
        
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'form-control form-control-sm';
        valueInput.placeholder = 'Header value';
        valueInput.value = value; // This properly escapes the value
        valueInput.dataset.index = index;
        valueInput.dataset.field = 'value';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.onclick = () => this.removeHeader(index);
        
        // Add event listeners
        [keyInput, valueInput].forEach(input => {
            input.addEventListener('input', (e) => {
                this.headers[parseInt(e.target.dataset.index)][e.target.dataset.field] = e.target.value;
                this.markAsChanged();
            });
        });
        
        item.appendChild(keyInput);
        item.appendChild(valueInput);
        item.appendChild(deleteBtn);
        list.appendChild(item);
        this.updateEmptyStates();
    }
    
    removeHeader(index) {
        this.headers.splice(index, 1);
        this.markAsChanged();
        this.renderHeaders();
    }
    
    renderHeaders() {
        document.getElementById('headersList').innerHTML = '';
        const temp = [...this.headers];
        this.headers = [];
        temp.forEach(h => this.addHeader(h.key, h.value));
    }
    
    // Body Fields Management
    addBodyField(key = '', value = '', isRandom = false) {
        const index = this.bodyFields.length;
        this.bodyFields.push({ key, value, isRandom: isRandom || false });
        this.markAsChanged();
        
        const list = document.getElementById('bodyFieldsList');
        const item = document.createElement('div');
        item.className = 'key-value-item';
        
        // Create elements properly to avoid HTML injection issues with special characters
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'form-control form-control-sm';
        keyInput.placeholder = 'Field name';
        keyInput.value = key; // This properly escapes the value
        keyInput.dataset.index = index;
        keyInput.dataset.field = 'key';
        
        const valueInput = document.createElement('input');
        valueInput.type = 'text';
        valueInput.className = 'form-control form-control-sm';
        valueInput.placeholder = isRandom ? 'JSON array: ["val1", "val2", "val3"]' : 'Field value';
        valueInput.value = value; // This properly escapes the value
        valueInput.dataset.index = index;
        valueInput.dataset.field = 'value';
        
        // Create random toggle checkbox
        const randomToggle = document.createElement('div');
        randomToggle.className = 'form-check form-switch ms-2';
        randomToggle.style.minWidth = '150px';
        randomToggle.innerHTML = `
            <input class="form-check-input" type="checkbox" id="random_${index}" 
                   ${isRandom ? 'checked' : ''}>
            <label class="form-check-label small" for="random_${index}" 
                   title="When enabled, provide a JSON array of values. A random value will be selected for each request.">
                <i class="fas fa-random"></i> Random
            </label>
        `;
        
        const randomCheckbox = randomToggle.querySelector('input');
        randomCheckbox.addEventListener('change', (e) => {
            const checked = e.target.checked;
            this.bodyFields[index].isRandom = checked;
            valueInput.placeholder = checked ? 'JSON array: ["val1", "val2", "val3"]' : 'Field value';
            
            // Add helpful hint badge
            if (checked && !valueInput.value.trim().startsWith('[')) {
                this.showToast('💡 Tip: Enter values as a JSON array, e.g., ["value1", "value2", "value3"]', 'info');
            }
            this.markAsChanged();
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.onclick = () => this.removeBodyField(index);
        
        // Add event listeners
        [keyInput, valueInput].forEach(input => {
            input.addEventListener('input', (e) => {
                this.bodyFields[parseInt(e.target.dataset.index)][e.target.dataset.field] = e.target.value;
                this.markAsChanged();
            });
        });
        
        item.appendChild(keyInput);
        item.appendChild(valueInput);
        item.appendChild(randomToggle);
        item.appendChild(deleteBtn);
        list.appendChild(item);
        this.updateEmptyStates();
    }
    
    removeBodyField(index) {
        this.bodyFields.splice(index, 1);
        this.markAsChanged();
        this.renderBodyFields();
    }
    
    renderBodyFields() {
        document.getElementById('bodyFieldsList').innerHTML = '';
        const temp = [...this.bodyFields];
        this.bodyFields = [];
        temp.forEach(f => this.addBodyField(f.key, f.value, f.isRandom));
    }
    
    // Paste JSON
    showPasteJsonModal() {
        const modal = new bootstrap.Modal(document.getElementById('pasteJsonModal'));
        modal.show();
    }
    
    validateJson() {
        let input = document.getElementById('jsonPasteInput').value;
        if (!input || !input.trim()) {
            this.showToast('Please paste JSON content first', 'warning');
            return;
        }
        
        // Clean input - remove invisible characters, fix smart quotes, etc.
        input = input.trim()
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
            .replace(/[\u2018\u2019]/g, "'")  // Smart quotes to regular
            .replace(/[\u201C\u201D]/g, '"'); // Smart double quotes to regular
        
        try {
            const json = JSON.parse(input);
            
            if (typeof json !== 'object' || json === null) {
                this.showToast('❌ JSON must be an object with key-value pairs', 'warning');
                return;
            }
            
            if (Array.isArray(json)) {
                this.showToast('❌ JSON must be an object, not an array. Try wrapping in { }', 'warning');
                return;
            }
            
            const fieldCount = Object.keys(json).length;
            this.showToast(`✅ Valid JSON! ${fieldCount} field${fieldCount !== 1 ? 's' : ''} found`, 'success');
        } catch (e) {
            let errorMsg = '❌ Invalid JSON';
            const errorDetails = e.message || '';
            
            // Check for specific issues
            if (input.includes(',}') || input.includes(',]') || input.includes(', }') || input.includes(', ]')) {
                errorMsg = '❌ Remove trailing comma before closing brace/bracket';
            } else if (!input.trim().startsWith('{') && !input.trim().startsWith('[')) {
                errorMsg = '❌ JSON must start with { or [';
            } else if (!input.trim().endsWith('}') && !input.trim().endsWith(']')) {
                errorMsg = '❌ JSON must end with } or ]';
            } else if (errorDetails.includes('position')) {
                // Extract position from error
                const match = errorDetails.match(/position (\d+)/);
                if (match) {
                    const pos = parseInt(match[1]);
                    errorMsg = `❌ Syntax error at position ${pos}: ${errorDetails}`;
                } else {
                    errorMsg = `❌ ${errorDetails}`;
                }
            } else if (errorDetails) {
                errorMsg = `❌ ${errorDetails}`;
            }
            
            this.showToast(errorMsg, 'danger');
            console.error('JSON Validation Error:', e);
            console.error('Input length:', input.length);
            console.error('First 100 chars:', input.substring(0, 100));
        }
    }
    
    applyPastedJson() {
        let input = document.getElementById('jsonPasteInput').value;
        if (!input || !input.trim()) {
            this.showToast('Please paste JSON content', 'warning');
            return;
        }
        
        // Clean input - same as validate
        input = input.trim()
            .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width spaces
            .replace(/[\u2018\u2019]/g, "'")  // Smart quotes to regular
            .replace(/[\u201C\u201D]/g, '"'); // Smart double quotes to regular
        
        try {
            const json = JSON.parse(input);
            
            // Check if it's an object
            if (typeof json !== 'object' || json === null) {
                this.showToast('JSON must be an object with key-value pairs', 'warning');
                return;
            }
            
            if (Array.isArray(json)) {
                this.showToast('JSON must be an object, not an array', 'warning');
                return;
            }
            
            // Clear existing fields
            this.bodyFields = [];
            document.getElementById('bodyFieldsList').innerHTML = '';
            
            // Add all fields from JSON
            Object.entries(json).forEach(([key, value]) => {
                // Handle different value types
                let stringValue;
                if (typeof value === 'object' && value !== null) {
                    stringValue = JSON.stringify(value);
                } else if (value === null) {
                    stringValue = 'null';
                } else if (typeof value === 'boolean') {
                    stringValue = value.toString();
                } else if (typeof value === 'number') {
                    stringValue = value.toString();
                } else {
                    stringValue = String(value);
                }
                this.addBodyField(key, stringValue);
            });
            
            // Close modal and show success
            bootstrap.Modal.getInstance(document.getElementById('pasteJsonModal')).hide();
            document.getElementById('jsonPasteInput').value = '';
            this.showToast(`✅ Successfully added ${Object.keys(json).length} fields!`, 'success');
        } catch (e) {
            // More helpful error message
            let errorMsg = '❌ Invalid JSON format';
            const errorDetails = e.message || '';
            
            // Common issues
            if (input.includes(',}') || input.includes(',]') || input.includes(', }') || input.includes(', ]')) {
                errorMsg = '❌ Remove trailing comma before closing brace/bracket';
            } else if (!input.trim().startsWith('{')) {
                errorMsg = '❌ Must start with opening brace {';
            } else if (!input.trim().endsWith('}')) {
                errorMsg = '❌ Must end with closing brace }';
            } else if (errorDetails.includes('position')) {
                const match = errorDetails.match(/position (\d+)/);
                if (match) {
                    errorMsg = `❌ Syntax error at position ${match[1]}`;
                } else {
                    errorMsg = `❌ ${errorDetails}`;
                }
            } else if (errorDetails) {
                errorMsg = `❌ ${errorDetails}`;
            }
            
            this.showToast(errorMsg, 'danger');
            console.error('JSON Parse Error:', e);
            console.error('Input length:', input.length);
            console.error('Input:', input);
        }
    }
    
    // Validation Rules
    showValidationModal() {
        // Reset form for new rule
        document.getElementById('validationType').value = 'exists';
        document.getElementById('validationValue').value = '';
        document.getElementById('fieldPath').value = '';
        document.getElementById('validationDescription').value = '';
        document.getElementById('fieldPathGroup').style.display = 'none';
        
        // Reset button
        const saveBtn = document.getElementById('saveValidationBtn');
        saveBtn.innerHTML = '<i class="fas fa-plus"></i> Add Rule';
        saveBtn.onclick = () => this.saveValidationRule();
        this.editingValidationIndex = null;
        
        const modal = new bootstrap.Modal(document.getElementById('validationModal'));
        modal.show();
    }
    
    saveValidationRule() {
        const type = document.getElementById('validationType').value;
        const value = document.getElementById('validationValue').value;
        const fieldPath = document.getElementById('fieldPath').value;
        const description = document.getElementById('validationDescription').value;
        
        if (!type || !value) {
            this.showToast('Please fill in validation type and value', 'warning');
            return;
        }
        
        const rule = { type, value, field_path: fieldPath || null, description: description || null };
        this.validationRules.push(rule);
        this.markAsChanged();
        this.renderValidationRules();
        bootstrap.Modal.getInstance(document.getElementById('validationModal')).hide();
        
        // Clear form
        document.getElementById('validationType').value = 'exists';
        document.getElementById('validationValue').value = '';
        document.getElementById('fieldPath').value = '';
        document.getElementById('validationDescription').value = '';
    }
    
    renderValidationRules() {
        const list = document.getElementById('validationList');
        list.innerHTML = '';
        
        this.validationRules.forEach((rule, index) => {
            const item = document.createElement('div');
            item.className = 'validation-item';
            item.innerHTML = `
                <div class="validation-info">
                    <div class="validation-type">${rule.type.replace('_', ' ')}</div>
                    <div class="validation-value">Value: ${rule.value}${rule.field_path ? ` | Path: ${rule.field_path}` : ''}</div>
                    ${rule.description ? `<div class="validation-value">${rule.description}</div>` : ''}
                </div>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="app.editValidationRule(${index})" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="app.removeValidationRule(${index})" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            list.appendChild(item);
        });
        
        this.updateEmptyStates();
    }
    
    editValidationRule(index) {
        const rule = this.validationRules[index];
        
        // Populate the modal with existing values
        document.getElementById('validationType').value = rule.type;
        document.getElementById('validationValue').value = rule.value;
        document.getElementById('fieldPath').value = rule.field_path || '';
        document.getElementById('validationDescription').value = rule.description || '';
        
        // Show/hide field path based on type
        document.getElementById('fieldPathGroup').style.display = 
            rule.type === 'json_path' ? 'block' : 'none';
        
        // Store the index being edited
        this.editingValidationIndex = index;
        
        // Change button text to "Update"
        const saveBtn = document.getElementById('saveValidationBtn');
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Update';
        saveBtn.onclick = () => this.updateValidationRule();
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('validationModal'));
        modal.show();
    }
    
    updateValidationRule() {
        const type = document.getElementById('validationType').value;
        const value = document.getElementById('validationValue').value;
        const fieldPath = document.getElementById('fieldPath').value;
        const description = document.getElementById('validationDescription').value;
        
        if (!value) {
            this.showToast('Please enter a value', 'warning');
            return;
        }
        
        // Update the rule
        this.validationRules[this.editingValidationIndex] = {
            type,
            value,
            field_path: fieldPath || null,
            description: description || null
        };
        
        this.markAsChanged();
        this.renderValidationRules();
        bootstrap.Modal.getInstance(document.getElementById('validationModal')).hide();
        
        // Reset button and form
        const saveBtn = document.getElementById('saveValidationBtn');
        saveBtn.innerHTML = '<i class="fas fa-plus"></i> Add Rule';
        saveBtn.onclick = () => this.saveValidationRule();
        this.editingValidationIndex = null;
        
        // Clear form
        document.getElementById('validationType').value = 'exists';
        document.getElementById('validationValue').value = '';
        document.getElementById('fieldPath').value = '';
        document.getElementById('validationDescription').value = '';
        
        this.showToast('Validation rule updated', 'success');
    }
    
    removeValidationRule(index) {
        this.validationRules.splice(index, 1);
        this.markAsChanged();
        this.renderValidationRules();
    }
    
    // Test Execution
    async runTest() {
        const apiUrl = document.getElementById('apiUrl').value;
        if (!apiUrl) {
            this.showToast('Please enter an API URL', 'warning');
            return;
        }
        
        if (this.isTestRunning) return;
        
        const headers = {};
        this.headers.forEach(h => { if (h.key && h.value) headers[h.key] = h.value; });
        
        let requestBody = {};
        let rawBody = null;
        let bodyFieldsConfig = [];
        
        if (this.bodyType === 'raw') {
            rawBody = document.getElementById('rawBodyInput').value;
        } else if (this.bodyType !== 'none') {
            // Build both request_body (for backward compatibility) and body_fields_config (for random values)
            this.bodyFields.forEach(f => {
                if (f.key && f.value) {
                    requestBody[f.key] = f.value;
                    bodyFieldsConfig.push({
                        key: f.key,
                        value: f.value,
                        isRandom: f.isRandom || false
                    });
                }
            });
        }
        
        // Store the HTTP method for display in realtime results
        this.currentHttpMethod = document.getElementById('httpMethod').value;
        
        const config = {
            base_url: apiUrl,
            http_method: this.currentHttpMethod,
            headers,
            body_type: this.bodyType,
            request_body: requestBody,
            body_fields_config: bodyFieldsConfig,
            raw_body: rawBody,
            concurrent_calls: parseInt(document.getElementById('concurrentCalls').value),
            sequential_batches: document.getElementById('sequentialBatches').value ? parseInt(document.getElementById('sequentialBatches').value) : null,
            validation_rules: this.validationRules,
            timeout: parseInt(document.getElementById('timeout').value),
            follow_redirects: document.getElementById('followRedirects').checked,
            verify_ssl: document.getElementById('verifySSL').checked
        };
        
        try {
            this.setTestRunning(true);
            this.showProgress();
            this.startClock();
            
            const response = await fetch('/api/test/start', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(config)
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            // Note: Test completion is handled via WebSocket messages
            // The response just confirms the test was started successfully
            const result = await response.json();
            
            // Store session ID for cancellation
            this.currentSessionId = result.session_id;
            
        } catch (error) {
            // Only handle errors if test hasn't completed via WebSocket
            if (this.isTestRunning) {
                this.setTestRunning(false);
                this.stopClock();
                this.hideProgress();
                this.showToast(`Test failed: ${error.message}`, 'danger');
            }
        }
    }
    
    async cancelTest() {
        if (!this.currentSessionId) {
            this.showToast('No active test to cancel', 'warning');
            return;
        }
        
        if (!confirm('Are you sure you want to cancel this test?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/test/${this.currentSessionId}/cancel`, {
                method: 'POST',
                headers: this.getAuthHeaders()
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            this.showToast('Test cancellation requested...', 'info');
        } catch (error) {
            this.showToast(`Failed to cancel test: ${error.message}`, 'danger');
        }
    }
    
    setTestRunning(running) {
        this.isTestRunning = running;
        const runBtn = document.getElementById('runTestBtn');
        const cancelBtn = document.getElementById('cancelTestBtn');
        
        if (running) {
            runBtn.disabled = true;
            runBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Running...';
            runBtn.style.display = 'none';
            cancelBtn.style.display = 'block';
        } else {
            runBtn.disabled = false;
            runBtn.innerHTML = '<i class="fas fa-play"></i> Run Load Test';
            runBtn.style.display = 'block';
            cancelBtn.style.display = 'none';
            this.currentSessionId = null;  // Clear session ID
        }
    }
    
    async loadResults(sessionId) {
        const response = await fetch(`/api/test/${sessionId}`, {
            headers: this.getAuthHeaders()
        });
        const session = await response.json();
        this.displayResults(session);
    }
    
    displayStatsFromWebSocket(stats) {
        // Hide progress and show stats
        this.hideProgress();
        document.getElementById('statsGrid').style.display = 'flex';
        
        // Update stat cards
        document.getElementById('statSuccessRate').textContent = `${stats.success_rate.toFixed(1)}%`;
        document.getElementById('statAvgTime').textContent = `${Math.round(stats.avg_response_time * 1000)}ms`;
        document.getElementById('statRPS').textContent = stats.requests_per_second.toFixed(1);
        document.getElementById('statFailed').textContent = stats.failed_requests;
        
        // Render charts using the real-time results we've already collected
        if (this.realtimeResults.length > 0) {
            this.renderChartsFromRealtimeResults();
        }
        
        // Ensure charts section is visible
        document.getElementById('chartsSection').style.display = 'block';
    }
    
    renderChartsFromRealtimeResults() {
        // Create a mock session object from realtime results for chart rendering
        const mockSession = {
            results: this.realtimeResults.map((data, index) => ({
                status: data.status,
                response_time: data.response_time,
                status_code: data.status_code,
                validation_passed: data.validation_passed
            })),
            config: {
                http_method: this.currentHttpMethod
            }
        };
        
        this.renderCharts(mockSession);
    }
    
    startClock() {
        this.testStartTime = Date.now();
        const clockElement = document.getElementById('runningClock');
        
        // Update immediately
        this.updateClock();
        
        // Update every second
        this.clockInterval = setInterval(() => {
            this.updateClock();
        }, 1000);
    }
    
    stopClock() {
        if (this.clockInterval) {
            clearInterval(this.clockInterval);
            this.clockInterval = null;
        }
    }
    
    updateClock() {
        if (!this.testStartTime) return;
        
        const elapsed = Math.floor((Date.now() - this.testStartTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        
        const clockElement = document.getElementById('runningClock');
        if (clockElement) {
            clockElement.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }
    
    showProgress() {
        document.getElementById('resultsEmpty').style.display = 'none';
        document.getElementById('progressCard').style.display = 'block';
        document.getElementById('statsGrid').style.display = 'none';
        document.getElementById('chartsSection').style.display = 'none';
        
        // Reset clock display
        const clockElement = document.getElementById('runningClock');
        if (clockElement) {
            clockElement.textContent = '00:00:00';
        }
        
        // Reset progress stats styling
        const progressStats = document.getElementById('progressStats');
        if (progressStats) {
            progressStats.style.color = '';
            progressStats.style.transform = 'scale(1)';
        }
        
        // Reset progress bar
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = '0%';
        }
        
        // Reset real-time results
        this.realtimeResults = [];
        
        // Clear and prepare the results table
        const tbody = document.getElementById('resultsTableBody');
        if (tbody) {
            tbody.innerHTML = '';
        }
        
        // Show the results table container (but it will be empty initially)
        document.getElementById('resultsTableContainer').style.display = 'block';
    }
    
    hideProgress() {
        document.getElementById('progressCard').style.display = 'none';
        this.stopClock();
    }
    
    addRealtimeResultRow(resultData) {
        console.log('Adding real-time result row:', resultData.request_num);
        
        // Store the result
        this.realtimeResults.push(resultData);
        
        const tbody = document.getElementById('resultsTableBody');
        if (!tbody) {
            console.error('Results table body not found!');
            return;
        }
        
        const index = this.realtimeResults.length - 1;
        const row = document.createElement('tr');
        
        const statusClass = resultData.status === 'success' ? 'success' : 'danger';
        const validationClass = resultData.validation_passed ? 'success' : 'danger';
        
        // Add a subtle fade-in animation
        row.style.opacity = '0';
        row.style.transform = 'translateY(-10px)';
        
        row.innerHTML = `
            <td>${resultData.request_num}</td>
            <td><span class="badge bg-${statusClass}">${resultData.status}</span></td>
            <td><span class="badge bg-secondary">${this.currentHttpMethod}</span></td>
            <td>${Math.round(resultData.response_time * 1000)}ms</td>
            <td>${resultData.status_code || 'N/A'}</td>
            <td><span class="badge bg-${validationClass}">${resultData.validation_passed ? 'Pass' : 'Fail'}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary" onclick="app.showRealtimeDetails(${index})">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        `;
        
        tbody.appendChild(row);
        
        // Trigger fade-in animation
        setTimeout(() => {
            row.style.transition = 'all 0.3s ease';
            row.style.opacity = '1';
            row.style.transform = 'translateY(0)';
        }, 10);
        
        // Scroll to the new row
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    showRealtimeDetails(index) {
        const result = this.realtimeResults[index];
        if (!result) return;
        
        // Parse request body if it's a string
        let requestBody = result.request_data;
        try {
            if (typeof requestBody === 'string' && requestBody) {
                requestBody = JSON.parse(requestBody);
            }
        } catch (e) {
            // Keep as-is if not valid JSON
        }
        
        // Format request details
        document.getElementById('requestDetails').textContent = JSON.stringify({
            method: this.currentHttpMethod,
            url: result.endpoint_url,
            headers: result.request_headers,
            body: requestBody
        }, null, 2);
        
        // Parse response body if it's a string
        let responseBody = result.response_data;
        try {
            if (typeof responseBody === 'string' && responseBody) {
                responseBody = JSON.parse(responseBody);
            }
        } catch (e) {
            // Keep as string if not valid JSON, but show it's truncated if needed
            if (typeof responseBody === 'string' && responseBody.length >= 9900) {
                responseBody = responseBody + '\n\n[Response truncated at 10KB for WebSocket transfer. View full response in saved logs.]';
            }
        }
        
        document.getElementById('responseDetails').textContent = JSON.stringify({
            status: result.status_code,
            time: result.response_time,
            headers: result.response_headers,
            body: responseBody,
            error: result.error_message || null
        }, null, 2);
        
        // Format validation details
        const validationDiv = document.getElementById('validationDetails');
        if (result.validation_results && result.validation_results.length > 0) {
            validationDiv.innerHTML = result.validation_results.map(v => `
                <div class="validation-detail-item ${v.passed ? 'success' : 'failed'}">
                    <strong>${v.rule.type}:</strong> ${v.passed ? '✓ Pass' : '✗ Fail'}<br>
                    <span class="text-muted small">${v.message}</span>
                </div>
            `).join('');
        } else {
            validationDiv.innerHTML = '<p class="text-muted">No validation rules</p>';
        }
        
        const modal = new bootstrap.Modal(document.getElementById('detailsModal'));
        modal.show();
    }
    
    displayResults(session) {
        this.hideProgress();
        this.currentSession = session;
        
        const stats = session.stats;
        document.getElementById('statsGrid').style.display = 'flex';
        document.getElementById('statSuccessRate').textContent = `${stats.success_rate.toFixed(1)}%`;
        document.getElementById('statAvgTime').textContent = `${Math.round(stats.avg_response_time * 1000)}ms`;
        document.getElementById('statRPS').textContent = stats.requests_per_second.toFixed(1);
        document.getElementById('statFailed').textContent = stats.failed_requests;
        
        // Render charts
        this.renderCharts(session);
        
        // The table is already populated with real-time results, so no need to re-populate it
        // Just ensure it's visible
        document.getElementById('resultsTableContainer').style.display = 'block';
        
        // Only populate the table if we don't have real-time results (e.g., loading historical data)
        if (this.realtimeResults.length === 0) {
            const tbody = document.getElementById('resultsTableBody');
            tbody.innerHTML = '';
            
            session.results.forEach((result, index) => {
                const row = document.createElement('tr');
                const statusClass = result.status === 'success' ? 'success' : 'danger';
                const validationClass = result.validation_passed ? 'success' : 'danger';
                
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td><span class="badge bg-${statusClass}">${result.status}</span></td>
                    <td><span class="badge bg-secondary">${session.config.http_method}</span></td>
                    <td>${Math.round(result.response_time * 1000)}ms</td>
                    <td>${result.status_code || 'N/A'}</td>
                    <td><span class="badge bg-${validationClass}">${result.validation_passed ? 'Pass' : 'Fail'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="app.showDetails(${index})">
                            <i class="fas fa-eye"></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
        }
    }
    
    renderCharts(session) {
        document.getElementById('chartsSection').style.display = 'block';
        
        // Destroy existing charts to prevent memory leaks
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        
        // Get theme
        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDarkMode ? '#e9ecef' : '#212529';
        const gridColor = isDarkMode ? '#495057' : '#dee2e6';
        
        // 1. Response Time Chart
        this.renderResponseTimeChart(session, textColor, gridColor);
        
        // 2. Success Rate Pie Chart
        this.renderSuccessRateChart(session, textColor);
        
        // 3. Status Code Distribution
        this.renderStatusCodeChart(session, textColor, gridColor);
    }
    
    renderResponseTimeChart(session, textColor, gridColor) {
        const ctx = document.getElementById('responseTimeChart');
        if (!ctx) return;
        
        const labels = session.results.map((_, index) => `#${index + 1}`);
        const responseTimes = session.results.map(r => (r.response_time * 1000).toFixed(2));
        const backgroundColors = session.results.map(r => 
            r.status === 'success' ? 'rgba(25, 135, 84, 0.7)' : 'rgba(220, 53, 69, 0.7)'
        );
        
        this.charts.responseTime = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Response Time (ms)',
                    data: responseTimes,
                    backgroundColor: backgroundColors,
                    borderColor: backgroundColors.map(c => c.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: textColor }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.parsed.y}ms`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: textColor,
                            callback: function(value) {
                                return value + 'ms';
                            }
                        },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }
    
    renderSuccessRateChart(session, textColor) {
        const ctx = document.getElementById('successRateChart');
        if (!ctx) return;
        
        const successCount = session.results.filter(r => r.status === 'success').length;
        const failedCount = session.results.length - successCount;
        
        this.charts.successRate = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Success', 'Failed'],
                datasets: [{
                    data: [successCount, failedCount],
                    backgroundColor: [
                        'rgba(25, 135, 84, 0.8)',
                        'rgba(220, 53, 69, 0.8)'
                    ],
                    borderColor: [
                        'rgba(25, 135, 84, 1)',
                        'rgba(220, 53, 69, 1)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { 
                            color: textColor,
                            padding: 15,
                            font: { size: 12 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.parsed / total) * 100).toFixed(1);
                                return `${context.label}: ${context.parsed} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
    
    renderStatusCodeChart(session, textColor, gridColor) {
        const ctx = document.getElementById('statusCodeChart');
        if (!ctx) return;
        
        // Count status codes
        const statusCodes = {};
        session.results.forEach(r => {
            const code = r.status_code || 'Error';
            statusCodes[code] = (statusCodes[code] || 0) + 1;
        });
        
        const labels = Object.keys(statusCodes).sort();
        const data = labels.map(label => statusCodes[label]);
        
        // Color based on status code type
        const colors = labels.map(code => {
            if (code === 'Error') return 'rgba(220, 53, 69, 0.7)';
            const numCode = parseInt(code);
            if (numCode >= 200 && numCode < 300) return 'rgba(25, 135, 84, 0.7)';
            if (numCode >= 300 && numCode < 400) return 'rgba(13, 110, 253, 0.7)';
            if (numCode >= 400 && numCode < 500) return 'rgba(255, 193, 7, 0.7)';
            if (numCode >= 500) return 'rgba(220, 53, 69, 0.7)';
            return 'rgba(108, 117, 125, 0.7)';
        });
        
        this.charts.statusCode = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Count',
                    data: data,
                    backgroundColor: colors,
                    borderColor: colors.map(c => c.replace('0.7', '1')),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Count: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { 
                            color: textColor,
                            stepSize: 1
                        },
                        grid: { color: gridColor }
                    },
                    x: {
                        ticks: { color: textColor },
                        grid: { color: gridColor }
                    }
                }
            }
        });
    }
    
    showDetails(index) {
        const result = this.currentSession.results[index];
        
        // Parse request body if it's a string
        let requestBody = result.request_data;
        try {
            if (typeof requestBody === 'string' && requestBody) {
                requestBody = JSON.parse(requestBody);
            }
        } catch (e) {
            // Keep as-is if not valid JSON
        }
        
        // Format request details
        document.getElementById('requestDetails').textContent = JSON.stringify({
            method: this.currentSession.config.http_method,
            url: result.endpoint_url,
            headers: result.request_headers,
            body: requestBody
        }, null, 2);
        
        // Parse response body if it's a string
        let responseBody = result.response_data;
        let wasTruncated = false;
        
        try {
            if (typeof responseBody === 'string' && responseBody) {
                // Check if it might be truncated
                if (responseBody.length > 5000) {
                    wasTruncated = true;
                }
                responseBody = JSON.parse(responseBody);
            }
        } catch (e) {
            // Keep as string if not valid JSON
            if (typeof responseBody === 'string' && responseBody) {
                // For very long non-JSON responses, show a preview
                if (responseBody.length > 10000) {
                    responseBody = responseBody.substring(0, 10000) + '\n\n[Response truncated. Full response available in saved logs.]';
                    wasTruncated = true;
                }
            } else {
                responseBody = 'No data';
            }
        }
        
        document.getElementById('responseDetails').textContent = JSON.stringify({
            status: result.status_code,
            time: result.response_time,
            headers: result.response_headers,
            body: responseBody,
            ...(wasTruncated && { note: 'Response may be truncated. Check saved log files for complete response.' })
        }, null, 2);
        
        const validationDiv = document.getElementById('validationDetails');
        if (result.validation_results && result.validation_results.length > 0) {
            validationDiv.innerHTML = result.validation_results.map(v => `
                <div class="validation-detail-item ${v.passed ? 'success' : 'failed'}">
                    <strong>${v.rule.type}:</strong> ${v.passed ? '✓ Pass' : '✗ Fail'}<br>
                    <span class="text-muted small">${v.message}</span>
                </div>
            `).join('');
        } else {
            validationDiv.innerHTML = '<p class="text-muted">No validation rules</p>';
        }
        
        const modal = new bootstrap.Modal(document.getElementById('detailsModal'));
        modal.show();
    }
    
    handleWebSocketMessage(data) {
        if (data.type === 'test_started') {
            document.getElementById('progressText').textContent = `Running ${data.total_requests} requests...`;
            document.getElementById('progressStats').textContent = `0 / ${data.total_requests}`;
            // Store total for accurate progress tracking
            this.totalRequestsInTest = data.total_requests;
            this.completedRequestsCount = 0;
            
            // Ensure progress card is visible
            const progressCard = document.getElementById('progressCard');
            if (progressCard) {
                progressCard.style.display = 'block';
            }
        } else if (data.type === 'request_completed') {
            console.log('Processing request_completed:', data.request_num);
            
            // Increment completed count
            this.completedRequestsCount++;
            
            // Use the total from test_started message for accuracy
            const total = this.totalRequestsInTest || this.getTotalRequests();
            const progress = (this.completedRequestsCount / total) * 100;
            
            // Update progress bar
            const progressFill = document.getElementById('progressFill');
            if (progressFill) {
                progressFill.style.width = `${progress}%`;
            }
            
            // Update counter with visual feedback
            const progressStats = document.getElementById('progressStats');
            if (progressStats) {
                progressStats.textContent = `${this.completedRequestsCount} / ${total}`;
                
                // Add a flash effect to make the update more visible
                progressStats.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    progressStats.style.transform = 'scale(1)';
                }, 200);
                
                // Color code based on status
                if (data.status === 'error') {
                    progressStats.style.color = '#dc3545';
                } else if (data.validation_passed === false) {
                    progressStats.style.color = '#ffc107';
                } else {
                    progressStats.style.color = '#198754';
                }
            }
            
            // Add the result row to the table in real-time
            console.log('About to add real-time row...');
            this.addRealtimeResultRow(data);
            console.log('Real-time row added');
        } else if (data.type === 'test_completed') {
            // Stop the button spinner immediately
            this.setTestRunning(false);
            this.stopClock();
            
            // Display stats directly from WebSocket message (more efficient and avoids race condition)
            if (data.stats) {
                this.displayStatsFromWebSocket(data.stats);
            } else {
                // Fallback: Load from API if stats not in message
                this.loadResults(data.session_id);
            }
            this.playCompletionSound();
            this.showToast('Test completed successfully', 'success');
        } else if (data.type === 'test_cancelled') {
            // Stop the button spinner on cancellation
            this.setTestRunning(false);
            this.stopClock();
            
            // Display stats directly from WebSocket message
            if (data.stats) {
                this.displayStatsFromWebSocket(data.stats);
                this.showToast(`Test cancelled. ${data.completed_requests || 0} requests completed.`, 'warning');
            } else {
                // Fallback: Load from API
                this.loadResults(data.session_id);
                this.showToast(`Test cancelled. ${data.completed_requests || 0} requests completed.`, 'warning');
            }
        } else if (data.type === 'test_failed') {
            // Stop the button spinner on failure
            this.setTestRunning(false);
            this.stopClock();
            this.hideProgress();
            this.showToast(`Test failed: ${data.error || 'Unknown error'}`, 'danger');
        }
    }
    
    getTotalRequests() {
        const concurrent = parseInt(document.getElementById('concurrentCalls').value) || 1;
        const batches = parseInt(document.getElementById('sequentialBatches').value) || 1;
        return concurrent * batches;
    }
    
    playCompletionSound() {
        const audio = document.getElementById('completionSound');
        if (audio) audio.play().catch(() => {});
    }
    
    // Config Name Bar Management
    showConfigNameBar(configName) {
        const bar = document.getElementById('configNameBar');
        const nameText = document.getElementById('configNameText');
        bar.style.display = 'block';
        nameText.textContent = configName || 'Unnamed Configuration';
        
        // Make sure we're in view mode
        document.getElementById('configNameView').style.setProperty('display', 'flex', 'important');
        document.getElementById('configNameEdit').style.setProperty('display', 'none', 'important');
    }
    
    hideConfigNameBar() {
        const bar = document.getElementById('configNameBar');
        bar.style.display = 'none';
        this.currentConfigId = null;
        this.currentConfigName = null;
    }
    
    setupBeforeUnloadWarning() {
        // Warn user if they try to leave the page with a loaded configuration
        window.addEventListener('beforeunload', (e) => {
            if (this.currentConfigId && this.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'Close configuration? Any unsaved changes will be lost.';
                return e.returnValue;
            }
        });
    }
    
    setupChangeTracking() {
        // Track changes to form fields
        const formFields = [
            'apiUrl', 'httpMethod', 'concurrentCalls', 'sequentialBatches', 
            'timeout', 'followRedirects', 'verifySSL', 'rawBodyInput'
        ];
        
        formFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.addEventListener('input', () => this.markAsChanged());
                field.addEventListener('change', () => this.markAsChanged());
            }
        });
        
        // Also mark as changed when body type changes
        document.querySelectorAll('[data-body-type]').forEach(btn => {
            btn.addEventListener('click', () => this.markAsChanged());
        });
        
        // Enforce numeric limits on timeout, concurrent calls, and sequential batches
        this.enforceNumericLimits();
    }
    
    enforceNumericLimits() {
        // Timeout: 1 to 1800 seconds
        const timeoutField = document.getElementById('timeout');
        if (timeoutField) {
            timeoutField.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                if (value > 1800) {
                    e.target.value = 1800;
                    this.showToast('Maximum timeout is 1800 seconds (30 minutes)', 'warning');
                } else if (value < 1 && e.target.value !== '') {
                    e.target.value = 1;
                }
            });
        }
        
        // Concurrent calls: 1 to 1000
        const concurrentField = document.getElementById('concurrentCalls');
        if (concurrentField) {
            concurrentField.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                if (value > 1000) {
                    e.target.value = 1000;
                    this.showToast('Maximum concurrent calls is 1000', 'warning');
                } else if (value < 1 && e.target.value !== '') {
                    e.target.value = 1;
                }
            });
        }
        
        // Sequential batches: 1 to 100
        const batchesField = document.getElementById('sequentialBatches');
        if (batchesField) {
            batchesField.addEventListener('input', (e) => {
                const value = parseInt(e.target.value);
                if (value > 100) {
                    e.target.value = 100;
                    this.showToast('Maximum sequential batches is 100', 'warning');
                } else if (value < 1 && e.target.value !== '' && e.target.value !== '0') {
                    e.target.value = 1;
                }
            });
        }
    }
    
    markAsChanged() {
        // Don't mark as changed if we're currently loading a config
        if (this.currentConfigId && !this.isLoadingConfig) {
            this.hasUnsavedChanges = true;
        }
    }
    
    enableConfigNameEdit() {
        const viewMode = document.getElementById('configNameView');
        const editMode = document.getElementById('configNameEdit');
        const input = document.getElementById('configNameInput');
        const currentName = document.getElementById('configNameText').textContent;
        
        // Switch to edit mode
        viewMode.style.setProperty('display', 'none', 'important');
        editMode.style.setProperty('display', 'flex', 'important');
        
        // Populate input with current name
        input.value = currentName;
        input.focus();
        input.select();
    }
    
    cancelConfigNameEdit() {
        // Switch back to view mode
        document.getElementById('configNameView').style.setProperty('display', 'flex', 'important');
        document.getElementById('configNameEdit').style.setProperty('display', 'none', 'important');
    }
    
    async saveConfigName() {
        const newName = document.getElementById('configNameInput').value.trim();
        if (!newName) {
            this.showToast('Configuration name cannot be empty', 'warning');
            return;
        }
        
        if (!this.currentConfigId) {
            this.showToast('No configuration loaded', 'warning');
            return;
        }
        
        // Check if name actually changed
        if (newName === this.currentConfigName) {
            this.cancelConfigNameEdit();
            return;
        }
        
        // Check for duplicate names (excluding current config)
        try {
            const listResponse = await fetch('/api/config/list', {
                headers: {
                    ...this.getAuthHeaders(),
                    'Cache-Control': 'no-cache'
                }
            });
            const data = await listResponse.json();
            const duplicate = data.configs.find(c => 
                c.name.toLowerCase() === newName.toLowerCase() && 
                c.id !== this.currentConfigId
            );
            
            if (duplicate) {
                this.showToast('Configuration name already exists. Please choose a different name.', 'warning');
                return;
            }
        } catch (error) {
            console.error('Error checking for duplicates:', error);
        }
        
        // Update the name
        this.currentConfigName = newName;
        
        // Auto-save with new name
        const config = {
            name: newName,
            id: this.currentConfigId,
            tenant_id: this.selectedTenantId, // Include selected tenant ID
            apiUrl: document.getElementById('apiUrl').value,
            httpMethod: document.getElementById('httpMethod').value,
            headers: this.headers,
            bodyType: this.bodyType,
            bodyFields: this.bodyFields,
            rawBody: document.getElementById('rawBodyInput').value,
            validationRules: this.validationRules,
            concurrentCalls: document.getElementById('concurrentCalls').value,
            sequentialBatches: document.getElementById('sequentialBatches').value,
            timeout: document.getElementById('timeout').value,
            followRedirects: document.getElementById('followRedirects').checked,
            verifySSL: document.getElementById('verifySSL').checked
        };
        
        try {
            const response = await fetch('/api/config/save', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(config)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save');
            }
            
            // Update display
            document.getElementById('configNameText').textContent = newName;
            this.hasUnsavedChanges = false;
            
            // Switch back to view mode
            this.cancelConfigNameEdit();
            
            this.showToast(`Configuration renamed to "${newName}"`, 'success');
        } catch (error) {
            this.showToast(error.message || 'Failed to update configuration name', 'danger');
        }
    }
    
    // Config Management
    async saveConfig() {
        // If we have a current config, ask if user wants to update or save as new
        let name = this.currentConfigName;
        let isUpdate = false;
        
        if (this.currentConfigId) {
            const choice = confirm(`Update existing config "${this.currentConfigName}"?\n\nOK = Update existing\nCancel = Save as new`);
            if (choice) {
                isUpdate = true;
            } else {
                name = prompt('Enter new configuration name:');
                if (!name) return;
            }
        } else {
            name = prompt('Enter configuration name:');
            if (!name) return;
        }
        
        // Check for duplicate names (only if saving as new)
        if (!isUpdate) {
            try {
                // Use selectedTenantId (properly initialized in loadUserTenants)
                const tenantIdToFilter = this.selectedTenantId;
                
                const listResponse = await fetch('/api/config/list', {
                    method: 'POST',
                    headers: {
                        ...this.getAuthHeaders(),
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache'
                    },
                    body: JSON.stringify({ tenant_id: tenantIdToFilter })
                });
                const data = await listResponse.json();
                const existingNames = data.configs.map(c => c.name.toLowerCase());
                
                if (existingNames.includes(name.toLowerCase())) {
                    this.showToast('Configuration name already exists. Please choose a different name.', 'warning');
                    return;
                }
            } catch (error) {
                console.error('Error checking for duplicates:', error);
            }
        }
        
        const config = {
            name,
            id: isUpdate ? this.currentConfigId : null,
            tenant_id: this.selectedTenantId, // Include selected tenant ID
            apiUrl: document.getElementById('apiUrl').value,
            httpMethod: document.getElementById('httpMethod').value,
            headers: this.headers,
            bodyType: this.bodyType,
            bodyFields: this.bodyFields,
            rawBody: document.getElementById('rawBodyInput').value,
            validationRules: this.validationRules,
            concurrentCalls: document.getElementById('concurrentCalls').value,
            sequentialBatches: document.getElementById('sequentialBatches').value,
            timeout: document.getElementById('timeout').value,
            followRedirects: document.getElementById('followRedirects').checked,
            verifySSL: document.getElementById('verifySSL').checked
        };
        
        try {
            const response = await fetch('/api/config/save', {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify(config)
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to save');
            }
            
            const result = await response.json();
            
            // Update current config tracking
            this.currentConfigId = result.id;
            this.currentConfigName = name;
            this.hasUnsavedChanges = false;
            
            this.showToast(isUpdate ? 'Configuration updated successfully' : 'Configuration saved successfully', 'success');
        } catch (error) {
            this.showToast(error.message || 'Failed to save configuration', 'danger');
        }
    }
    
    async refreshConfigList() {
        // Refresh the config list without showing/hiding the modal
        try {
            const tenantIdToFilter = this.selectedTenantId;
            
            console.log('[refreshConfigList] Filtering by tenant_id:', tenantIdToFilter);
            
            const response = await fetch('/api/config/list', {
                method: 'POST',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache'
                },
                body: JSON.stringify({ tenant_id: tenantIdToFilter })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch configs: ${response.status}`);
            }
            
            const data = await response.json();
            
            console.log('Configs loaded:', data.configs.length, 'configs');
            
            const list = document.getElementById('configsList');
            const empty = document.getElementById('configsEmpty');
            
            if (data.configs.length === 0) {
                list.style.display = 'none';
                empty.style.display = 'block';
            } else {
                list.style.display = 'block';
                empty.style.display = 'none';
                list.innerHTML = '';
                
                data.configs.forEach(config => {
                    const item = document.createElement('div');
                    const isActive = config.id === this.currentConfigId;
                    item.className = `list-group-item config-item${isActive ? ' active' : ''}`;
                    item.style.cursor = 'pointer';
                    
                    // Show tenant info for super admin
                    const tenantBadge = config.tenant_name ? 
                        `<span class="badge bg-info text-white ms-2">${this.escapeHtml(config.tenant_name)}</span>` : '';
                    
                    item.innerHTML = `
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="config-item-name">
                                    ${config.name}${isActive ? ' <small class="text-primary">(Current)</small>' : ''}
                                    ${tenantBadge}
                                </div>
                                <div class="config-item-meta">Saved: ${new Date(config.saved_at).toLocaleString()}</div>
                            </div>
                            <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); app.deleteConfig('${config.id}')">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;
                    item.onclick = () => this.loadConfig(config.id);
                    list.appendChild(item);
                });
            }
        } catch (error) {
            this.showToast('Failed to load configurations', 'danger');
        }
    }
    
    async showLoadConfigModal() {
        try {
            // Refresh the list first
            await this.refreshConfigList();
            
            // Then show the modal
            const modalElement = document.getElementById('loadConfigModal');
            const modal = bootstrap.Modal.getInstance(modalElement) || new bootstrap.Modal(modalElement);
            modal.show();
        } catch (error) {
            this.showToast('Failed to load configurations', 'danger');
        }
    }
    
    async loadConfig(configId) {
        // Check if there's already a configuration loaded with unsaved changes
        if (this.currentConfigId && this.currentConfigId !== configId && this.hasUnsavedChanges) {
            if (!confirm('Close configuration? Any unsaved changes will be lost.\n\nLoad a different configuration?')) {
                return;
            }
        }
        
        try {
            // Set flag to prevent marking as changed while loading
            this.isLoadingConfig = true;
            
            const response = await fetch(`/api/config/${configId}`, {
                headers: this.getAuthHeaders()
            });
            const config = await response.json();
            
            document.getElementById('apiUrl').value = config.apiUrl || '';
            document.getElementById('httpMethod').value = config.httpMethod || 'POST';
            document.getElementById('concurrentCalls').value = config.concurrentCalls || 1;
            document.getElementById('sequentialBatches').value = config.sequentialBatches || '';
            document.getElementById('timeout').value = config.timeout || 600;
            document.getElementById('followRedirects').checked = config.followRedirects !== false;
            document.getElementById('verifySSL').checked = config.verifySSL === true;
            document.getElementById('rawBodyInput').value = config.rawBody || '';
            
            this.headers = config.headers || [];
            this.bodyFields = config.bodyFields || [];
            this.validationRules = config.validationRules || [];
            this.bodyType = config.bodyType || 'json';
            
            // Track the loaded config
            this.currentConfigId = config.id;
            this.currentConfigName = config.name;
            this.hasUnsavedChanges = false;
            
            // Show config name bar
            this.showConfigNameBar(config.name);
            
            this.renderHeaders();
            this.renderBodyFields();
            this.renderValidationRules();
            
            document.querySelectorAll('[data-body-type]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.bodyType === this.bodyType);
            });
            this.toggleBodySection();
            
            // Done loading - re-enable change tracking
            this.isLoadingConfig = false;
            
            bootstrap.Modal.getInstance(document.getElementById('loadConfigModal')).hide();
            this.showToast(`Configuration "${config.name}" loaded`, 'success');
        } catch (error) {
            this.isLoadingConfig = false;
            this.showToast('Failed to load configuration', 'danger');
        }
    }
    
    async deleteConfig(configId) {
        if (!confirm('Delete this configuration?')) return;
        
        try {
            const response = await fetch(`/api/config/${configId}`, { 
                method: 'DELETE',
                headers: this.getAuthHeaders()
            });
            if (!response.ok) throw new Error('Failed to delete');
            
            this.showToast('Configuration deleted', 'success');
            
            // Just refresh the list, don't re-show modal (it's already open)
            await this.refreshConfigList();
        } catch (error) {
            this.showToast('Failed to delete configuration', 'danger');
        }
    }
    
    // Utilities
    exportResults() {
        if (!this.currentSession) return;
        const data = JSON.stringify(this.currentSession, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `load-test-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
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
    
    updateEmptyStates() {
        const headersEmpty = document.getElementById('headersEmpty');
        const bodyEmpty = document.getElementById('bodyEmpty');
        const validationEmpty = document.getElementById('validationEmpty');
        
        if (headersEmpty) {
            headersEmpty.style.display = this.headers.length === 0 ? 'block' : 'none';
        }
        if (bodyEmpty) {
            bodyEmpty.style.display = this.bodyFields.length === 0 && this.bodyType !== 'raw' && this.bodyType !== 'none' ? 'block' : 'none';
        }
        if (validationEmpty) {
            validationEmpty.style.display = this.validationRules.length === 0 ? 'block' : 'none';
        }
    }
}

// Initialize app when DOM is ready
let app;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app = new LoadTestApp();
    });
} else {
    // DOM is already loaded
    app = new LoadTestApp();
}
