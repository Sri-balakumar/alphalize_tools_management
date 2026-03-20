/** @odoo-module **/

import { registry } from "@web/core/registry";
import { Component, useState } from "@odoo/owl";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

/**
 * ImagePreviewField – Binary field widget that shows a fixed-size thumbnail
 * and opens a full-screen popup when clicked.
 *
 * Auto-detects signature fields (field name contains "signature") and uses
 * a white popup background so the signature is visible.
 *
 * Usage:  widget="image_preview"
 */
export class ImagePreviewField extends Component {
    static template = "tools_rental_management.ImagePreviewField";
    static props = { ...standardFieldProps };

    setup() {
        this.state = useState({ showModal: false });
    }

    get imageUrl() {
        const value = this.props.record.data[this.props.name];
        if (!value) return false;

        // Saved record → use /web/image endpoint
        const resId = this.props.record.resId;
        if (resId) {
            const model = this.props.record.resModel;
            const field = this.props.name;
            return `/web/image/${model}/${resId}/${field}`;
        }

        // Unsaved record → base64 data URI
        if (typeof value === "string") {
            if (value.startsWith("data:")) return value;
            return `data:image/png;base64,${value}`;
        }
        return false;
    }

    get hasImage() {
        return !!this.props.record.data[this.props.name];
    }

    /** Auto-detect signature fields → use white popup background */
    get isSignature() {
        return (this.props.name || "").toLowerCase().includes("signature");
    }

    get overlayStyle() {
        const bg = this.isSignature ? "rgba(255,255,255,0.95)" : "rgba(0,0,0,0.88)";
        return `position:fixed;top:0;left:0;width:100vw;height:100vh;`
             + `background:${bg};z-index:10000;`
             + `display:flex;align-items:center;justify-content:center;`;
    }

    get closeBtnColor() {
        return this.isSignature ? "#333" : "#fff";
    }

    onImageClick(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        if (this.imageUrl) {
            this.state.showModal = true;
        }
    }

    onCloseModal(ev) {
        ev.stopPropagation();
        ev.preventDefault();
        this.state.showModal = false;
    }

    onOverlayClick(ev) {
        if (ev.target === ev.currentTarget) {
            this.state.showModal = false;
        }
    }
}

export const imagePreviewField = {
    component: ImagePreviewField,
    supportedTypes: ["binary"],
};

registry.category("fields").add("image_preview", imagePreviewField);
