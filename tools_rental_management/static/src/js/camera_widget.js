/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState } from "@odoo/owl";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

/**
 * CameraWidget – a Binary field widget that provides two buttons:
 *   1. "Open Camera"  – triggers <input capture="environment"> → opens device camera
 *   2. "Attach File"  – triggers plain <input type="file"> for any document
 *
 * On mobile devices the "Open Camera" button launches the rear camera directly.
 * On desktop it falls back to a file-picker filtered to images.
 */
export class CameraWidget extends Component {
    static template = "tools_rental_management.CameraWidget";
    static props = { ...standardFieldProps };

    setup() {
        this.state = useState({
            preview: this._buildPreview(this.props.record.data[this.props.name]),
            fileName: "",
        });
    }

    /* ── helpers ─────────────────────────────────────────────── */

    _buildPreview(value) {
        if (value) {
            // value may already include the data-uri prefix or be raw base64
            if (typeof value === "string" && value.startsWith("data:")) {
                return value;
            }
            return `data:image/jpeg;base64,${value}`;
        }
        return null;
    }

    /* ── actions ─────────────────────────────────────────────── */

    openCamera() {
        this._triggerInput("image/*", "environment");
    }

    openFilePicker() {
        this._triggerInput("image/*,.pdf,.doc,.docx,.jpg,.jpeg,.png", null);
    }

    _triggerInput(accept, capture) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        if (capture) {
            input.setAttribute("capture", capture);
        }
        input.addEventListener("change", (ev) => this._onFileChange(ev));
        input.click();
    }

    _onFileChange(ev) {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUri = e.target.result;
            const base64 = dataUri.split(",")[1];
            this.props.record.update({ [this.props.name]: base64 });
            this.state.preview = dataUri;
            this.state.fileName = file.name;
        };
        reader.readAsDataURL(file);
    }

    onRemove() {
        this.props.record.update({ [this.props.name]: false });
        this.state.preview = null;
        this.state.fileName = "";
    }
}

export const cameraField = {
    component: CameraWidget,
    supportedTypes: ["binary"],
};

registry.category("fields").add("camera_file_upload", cameraField);
