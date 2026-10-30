const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp"
]);

document.querySelectorAll("#listing-form, [data-review-form]").forEach((form) => {
  const isReviewForm = form.hasAttribute("data-review-form");
  const fieldLabels = isReviewForm
    ? { rating: "Rating", comment: "Review comment" }
    : { title: "Title", description: "Description", price: "Price", image: "Listing image", location: "Location", country: "Country" };

  const fieldKey = (field) => field.name.match(/\[(.+)]/)?.[1] || field.name;
  const uploadStatus = form.querySelector("[data-upload-status]");

  form.querySelectorAll("input, textarea, select").forEach((field) => {
    const error = form.querySelector(`[data-field="${fieldKey(field)}"]`);
    if (!error || error.hidden) return;
    field.setAttribute("aria-invalid", "true");
    if (error.id) {
      const describedBy = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
      describedBy.add(error.id);
      field.setAttribute("aria-describedby", [...describedBy].join(" "));
    }
  });

  const getMessage = (field) => {
    const key = fieldKey(field);
    if (key === "image" && field.type === "file") {
      const file = field.files[0];
      if (!file) return "Please choose an image file.";
      if (file.size > MAX_IMAGE_SIZE) return "Image must be 5 MB or smaller.";
      if (!SUPPORTED_IMAGE_TYPES.has(file.type)) return "Choose a JPEG, PNG, GIF, or WebP image.";
    }
    if (!field.value.trim()) return `${fieldLabels[key]} is required.`;
    if (key === "image") return "Image must be a valid http(s) URL.";
    if (key === "price" && field.validity.rangeUnderflow) return "Price cannot be negative.";
    if (key === "rating" && (field.validity.rangeUnderflow || field.validity.rangeOverflow)) return "Rating must be between 1 and 5.";
    if (key === "comment" && field.validity.tooLong) return "Review comment cannot exceed 1000 characters.";
    return field.validationMessage || `Please enter a valid ${fieldLabels[key]}.`;
  };

  const validateField = (field, showEmptyError = false) => {
    const key = fieldKey(field);
    const isFileInput = key === "image" && field.type === "file";
    const file = isFileInput ? field.files[0] : null;

    if (isFileInput) {
      const invalidFile = file && (
        file.size > MAX_IMAGE_SIZE || !SUPPORTED_IMAGE_TYPES.has(file.type)
      );
      field.setCustomValidity(invalidFile ? getMessage(field) : "");
    } else if (key === "image") {
      const isHttpUrl = /^https?:\/\/.+/i.test(field.value.trim());
      field.setCustomValidity(field.value.trim() && !isHttpUrl ? "Invalid URL" : "");
    }

    const isEmpty = !field.value.trim();
    const isOptionalEmptyFile = isFileInput && !field.required && !file;
    const isValid = isOptionalEmptyFile || (!isEmpty && field.validity.valid);
    const error = form.querySelector(`[data-field="${key}"]`);

    field.classList.toggle("is-valid", isValid);
    field.classList.toggle("is-invalid", !isValid && (!isEmpty || showEmptyError || Boolean(file)));
    field.setAttribute("aria-invalid", String(!isValid && (!isEmpty || showEmptyError || Boolean(file))));
    if (error) {
      error.hidden = isValid || (isEmpty && !showEmptyError && !file);
      if (!error.hidden) error.textContent = getMessage(field);
      if (error.id) {
        const describedBy = new Set((field.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean));
        describedBy.add(error.id);
        field.setAttribute("aria-describedby", [...describedBy].join(" "));
      }
    }
    return isValid;
  };

  form.querySelectorAll("input, textarea, select").forEach((field) => {
    if (!field.required && field.type !== "file") return;
    field.addEventListener("input", () => validateField(field));
    field.addEventListener("change", () => validateField(field));
    field.addEventListener("blur", () => validateField(field, true));
  });

  const imageInput = form.querySelector('input[type="file"][name="image"]');
  if (imageInput && uploadStatus) {
    imageInput.addEventListener("change", () => {
      const file = imageInput.files[0];
      uploadStatus.classList.remove("upload-status-error", "upload-status-success");
      validateField(imageInput);

      if (!file) {
        uploadStatus.textContent = imageInput.required ? "No image selected yet." : "No replacement selected.";
      } else if (file.size > MAX_IMAGE_SIZE) {
        uploadStatus.textContent = "Image is too large. Choose a file that is 5 MB or smaller.";
        uploadStatus.classList.add("upload-status-error");
      } else if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
        uploadStatus.textContent = "Unsupported image format. Choose JPEG, PNG, GIF, or WebP.";
        uploadStatus.classList.add("upload-status-error");
      } else {
        uploadStatus.textContent = `Selected ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB).`;
        uploadStatus.classList.add("upload-status-success");
      }
    });
  }

  form.addEventListener("submit", (event) => {
    const invalidField = [...form.querySelectorAll("[required], input[type='file']")]
      .find((field) => !validateField(field, true));
    if (invalidField) {
      event.preventDefault();
      invalidField.focus();
    }
  });
});

document.querySelectorAll("[data-rating-input]").forEach((input) => {
  const output = input.parentElement.querySelector("[data-rating-output]");
  const updateOutput = () => {
    output.value = input.value;
    output.textContent = input.value;
  };

  input.addEventListener("input", updateOutput);
  updateOutput();
});

document.querySelectorAll("[data-review-edit]").forEach((button) => {
  button.addEventListener("click", () => {
    const form = document.getElementById(button.dataset.reviewEdit);
    if (!form) return;
    const isHidden = form.hidden;
    form.hidden = !isHidden;
    button.setAttribute("aria-expanded", String(isHidden));
    button.textContent = isHidden ? "Cancel" : "Edit";
  });
});

document.querySelectorAll("[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});
