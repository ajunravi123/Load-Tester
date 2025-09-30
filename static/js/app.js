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
        
        this.init();
    }
    
    init() {
        this.connectWebSocket();
        this.setupEventListeners();
        this.loadTheme();
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
    
    newTest() {
        if (confirm('Are you sure you want to clear all fields and start a new test?')) {
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
            if (timeout) timeout.value = '30';
            if (followRedirects) followRedirects.checked = true;
            if (verifySSL) verifySSL.checked = false;
            
            // Clear results
            this.currentSession = null;
            const resultsSection = document.getElementById('resultsSection');
            if (resultsSection) {
                resultsSection.innerHTML = '<div class="text-center text-muted py-5">Run a test to see results here</div>';
            }
            
            // Hide stats and progress
            const statsGrid = document.getElementById('statsGrid');
            const progressCard = document.getElementById('progressCard');
            const resultsTableContainer = document.getElementById('resultsTableContainer');
            if (statsGrid) statsGrid.style.display = 'none';
            if (progressCard) progressCard.style.display = 'none';
            if (resultsTableContainer) resultsTableContainer.style.display = 'none';
            
            // Clear config tracking
            this.currentConfigId = null;
            this.currentConfigName = null;
            
            // Update empty states
            this.updateEmptyStates();
            
            this.showToast('✨ Ready for a new test!', 'success');
        }
    }
    
    // WebSocket
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
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
        
        // Export
        document.getElementById('exportBtn').addEventListener('click', () => this.exportResults());
        
        // Config
        document.getElementById('saveConfigBtn').addEventListener('click', () => this.saveConfig());
        document.getElementById('loadConfigBtn').addEventListener('click', () => this.showLoadConfigModal());
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
        this.renderHeaders();
    }
    
    renderHeaders() {
        document.getElementById('headersList').innerHTML = '';
        const temp = [...this.headers];
        this.headers = [];
        temp.forEach(h => this.addHeader(h.key, h.value));
    }
    
    // Body Fields Management
    addBodyField(key = '', value = '') {
        const index = this.bodyFields.length;
        this.bodyFields.push({ key, value });
        
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
        valueInput.placeholder = 'Field value';
        valueInput.value = value; // This properly escapes the value
        valueInput.dataset.index = index;
        valueInput.dataset.field = 'value';
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.onclick = () => this.removeBodyField(index);
        
        // Add event listeners
        [keyInput, valueInput].forEach(input => {
            input.addEventListener('input', (e) => {
                this.bodyFields[parseInt(e.target.dataset.index)][e.target.dataset.field] = e.target.value;
            });
        });
        
        item.appendChild(keyInput);
        item.appendChild(valueInput);
        item.appendChild(deleteBtn);
        list.appendChild(item);
        this.updateEmptyStates();
    }
    
    removeBodyField(index) {
        this.bodyFields.splice(index, 1);
        this.renderBodyFields();
    }
    
    renderBodyFields() {
        document.getElementById('bodyFieldsList').innerHTML = '';
        const temp = [...this.bodyFields];
        this.bodyFields = [];
        temp.forEach(f => this.addBodyField(f.key, f.value));
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
        
        if (this.bodyType === 'raw') {
            rawBody = document.getElementById('rawBodyInput').value;
        } else if (this.bodyType !== 'none') {
            this.bodyFields.forEach(f => { if (f.key && f.value) requestBody[f.key] = f.value; });
        }
        
        const config = {
            base_url: apiUrl,
            http_method: document.getElementById('httpMethod').value,
            headers,
            body_type: this.bodyType,
            request_body: requestBody,
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
            
            const response = await fetch('/api/test/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const result = await response.json();
            await this.loadResults(result.session_id);
            this.playCompletionSound();
            this.showToast('Test completed successfully', 'success');
        } catch (error) {
            this.showToast(`Test failed: ${error.message}`, 'danger');
            this.hideProgress();
        } finally {
            this.setTestRunning(false);
        }
    }
    
    setTestRunning(running) {
        this.isTestRunning = running;
        const btn = document.getElementById('runTestBtn');
        if (running) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Running...';
        } else {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play"></i> Run Load Test';
        }
    }
    
    async loadResults(sessionId) {
        const response = await fetch(`/api/test/${sessionId}`);
        const session = await response.json();
        this.displayResults(session);
    }
    
    showProgress() {
        document.getElementById('resultsEmpty').style.display = 'none';
        document.getElementById('progressCard').style.display = 'block';
        document.getElementById('statsGrid').style.display = 'none';
        document.getElementById('resultsTableContainer').style.display = 'none';
    }
    
    hideProgress() {
        document.getElementById('progressCard').style.display = 'none';
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
        
        document.getElementById('resultsTableContainer').style.display = 'block';
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
    
    showDetails(index) {
        const result = this.currentSession.results[index];
        
        document.getElementById('requestDetails').textContent = JSON.stringify({
            method: this.currentSession.config.http_method,
            url: result.endpoint_url,
            headers: result.request_headers,
            body: result.request_data
        }, null, 2);
        
        document.getElementById('responseDetails').textContent = JSON.stringify({
            status: result.status_code,
            time: result.response_time,
            headers: result.response_headers,
            body: result.response_data ? result.response_data.substring(0, 3000) : 'No data'
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
        } else if (data.type === 'request_completed') {
            const total = this.getTotalRequests();
            const progress = (data.request_num / total) * 100;
            document.getElementById('progressFill').style.width = `${progress}%`;
            document.getElementById('progressStats').textContent = `${data.request_num} / ${total}`;
        } else if (data.type === 'test_completed') {
            this.loadResults(data.session_id);
            this.playCompletionSound();
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
                const listResponse = await fetch('/api/config/list');
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
                headers: { 'Content-Type': 'application/json' },
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
            
            this.showToast(isUpdate ? 'Configuration updated successfully' : 'Configuration saved successfully', 'success');
        } catch (error) {
            this.showToast(error.message || 'Failed to save configuration', 'danger');
        }
    }
    
    async showLoadConfigModal() {
        try {
            const response = await fetch('/api/config/list');
            const data = await response.json();
            
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
                    item.className = 'list-group-item config-item';
                    item.style.cursor = 'pointer';
                    item.innerHTML = `
                        <div class="d-flex justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="config-item-name">${config.name}</div>
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
            
            const modal = new bootstrap.Modal(document.getElementById('loadConfigModal'));
            modal.show();
        } catch (error) {
            this.showToast('Failed to load configurations', 'danger');
        }
    }
    
    async loadConfig(configId) {
        try {
            const response = await fetch(`/api/config/${configId}`);
            const config = await response.json();
            
            document.getElementById('apiUrl').value = config.apiUrl || '';
            document.getElementById('httpMethod').value = config.httpMethod || 'POST';
            document.getElementById('concurrentCalls').value = config.concurrentCalls || 1;
            document.getElementById('sequentialBatches').value = config.sequentialBatches || '';
            document.getElementById('timeout').value = config.timeout || 30;
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
            
            this.renderHeaders();
            this.renderBodyFields();
            this.renderValidationRules();
            
            document.querySelectorAll('[data-body-type]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.bodyType === this.bodyType);
            });
            this.toggleBodySection();
            
            bootstrap.Modal.getInstance(document.getElementById('loadConfigModal')).hide();
            this.showToast(`Configuration "${config.name}" loaded`, 'success');
        } catch (error) {
            this.showToast('Failed to load configuration', 'danger');
        }
    }
    
    async deleteConfig(configId) {
        if (!confirm('Delete this configuration?')) return;
        
        try {
            const response = await fetch(`/api/config/${configId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete');
            
            this.showToast('Configuration deleted', 'success');
            this.showLoadConfigModal(); // Refresh list
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
