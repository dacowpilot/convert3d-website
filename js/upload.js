const fileInput = document.getElementById('fileInput');
const browseBtn = document.getElementById('browseBtn');
const fileList = document.getElementById('fileList');
const statusMessage = document.getElementById('statusMessage');
const summaryText = document.getElementById('summaryText');
const uploadBox = document.querySelector('.upload-box');
const dropTitle = document.querySelector('.drop-zone__title');
const convertBtn = document.getElementById('convertBtn');
const downloadLink = document.getElementById('downloadLink');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');

let selectedFiles = [];

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderFiles(files) {
    if (!files.length) {
        fileList.innerHTML = '<li class="file-list__empty">No files selected yet.</li>';
        return;
    }

    fileList.innerHTML = files
        .map((file) => `
            <li class="file-item">
                <span class="file-item__name">${file.name}</span>
                <span class="file-item__meta">${formatFileSize(file.size)} • ${file.type || 'Unknown type'}</span>
            </li>
        `)
        .join('');
}

function setProgress(value, label) {
    progressFill.style.width = `${value}%`;
    progressFill.setAttribute('aria-valuenow', String(value));
    progressLabel.textContent = label;
}

function setUploadState(files) {
    const selected = Array.from(files || []);
    selectedFiles = selected;
    renderFiles(selected);

    if (selected.length) {
        dropTitle.textContent = 'File ready';
        statusMessage.textContent = `Selected ${selected.length} file${selected.length > 1 ? 's' : ''}.`;
        summaryText.textContent = `${selected.length} file${selected.length > 1 ? 's' : ''} ready to use.`;
    } else {
        dropTitle.textContent = 'Upload a 3D model';
        statusMessage.textContent = 'No files selected yet.';
        summaryText.textContent = 'No model selected yet. Choose a file to begin.';
    }

    convertBtn.disabled = selected.length === 0;
    setProgress(selected.length ? 25 : 0, selected.length ? 'Ready to convert' : 'Idle');
}

function handleFiles(files) {
    const selected = Array.from(files || []);
    setUploadState(selected);
}

function convertSelectedFile() {
    if (!selectedFiles.length) {
        statusMessage.textContent = 'Choose a file before converting.';
        return;
    }

    const source = selectedFiles[0];
    const outputFormat = document.getElementById('outputFormat').value;
    const baseName = source.name.replace(/\.[^.]+$/, '') || 'converted-model';
    const downloadName = `${baseName}.${outputFormat}`;

    setProgress(50, 'Creating download');
    statusMessage.textContent = `Preparing ${downloadName}...`;

    let content = `Converted from ${source.name}\nOutput format: ${outputFormat.toUpperCase()}\n`;
    if (outputFormat === 'stl') {
        content += 'solid converted_model\nendsolid converted_model\n';
    } else if (outputFormat === 'step') {
        content += 'ISO-10303-21;\nEND-ISO-10303-21;\n';
    } else {
        content += '{"message":"this is a placeholder conversion output"}';
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    downloadLink.href = url;
    downloadLink.download = downloadName;
    downloadLink.textContent = `Download ${downloadName}`;
    downloadLink.hidden = false;

    setProgress(100, 'Done');
    statusMessage.textContent = `Conversion complete. Download ${downloadName}.`;
}

browseBtn.addEventListener('click', (event) => {
    event.preventDefault();
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    handleFiles(event.target.files);
});

['dragenter', 'dragover'].forEach((eventName) => {
    uploadBox.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadBox.classList.add('is-dragging');
    });
});

['dragleave', 'dragend', 'drop'].forEach((eventName) => {
    uploadBox.addEventListener(eventName, (event) => {
        event.preventDefault();
        uploadBox.classList.remove('is-dragging');
    });
});

uploadBox.addEventListener('drop', (event) => {
    event.preventDefault();
    handleFiles(event.dataTransfer?.files || []);
});

convertBtn.addEventListener('click', () => {
    convertSelectedFile();
});

setUploadState([]);
