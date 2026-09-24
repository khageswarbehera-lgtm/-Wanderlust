document.querySelectorAll("#listing-form, [data-review-form]").forEach((form) => {
  const isReviewForm = form.hasAttribute("data-review-form");
  const fieldLabels = isReviewForm
    ? { rating: "Rating", comment: "Review comment" }
    : { title: "Title", description: "Description", price: "Price", image: "Listing image", location: "Location", country: "Country" };

  const fieldKey = (field) => field.name.match(/\[(.+)]/)?.[1] || field.name;

  const getMessage = (field) => {
    const key = fieldKey(field);
    if (!field.value.trim()) return `${fieldLabels[key]} is required.`;
    if (key === "image" && field.type === "file") return "Please choose an image file.";
    if (key === "image") return "Image must be a valid http(s) URL.";
    if (key === "price" && field.validity.rangeUnderflow) return "Price cannot be negative.";
    if (key === "rating" && (field.validity.rangeUnderflow || field.validity.rangeOverflow)) return "Rating must be between 1 and 5.";
    if (key === "comment" && field.validity.tooLong) return "Review comment cannot exceed 1000 characters.";
    return field.validationMessage || `Please enter a valid ${fieldLabels[key]}.`;
  };

  const validateField = (field, showEmptyError = false) => {
    const key = fieldKey(field);
    if (key === "image" && field.type !== "file") {
      const isHttpUrl = /^https?:\/\/.+/i.test(field.value.trim());
      field.setCustomValidity(field.value.trim() && !isHttpUrl ? "Invalid URL" : "");
    }

    const isEmpty = !field.value.trim();
    const isValid = !isEmpty && field.validity.valid;
    const error = form.querySelector(`[data-field="${key}"]`);

    field.classList.toggle("is-valid", isValid);
    field.classList.toggle("is-invalid", !isValid && (!isEmpty || showEmptyError));
    if (error) {
      error.hidden = isValid || (isEmpty && !showEmptyError);
      if (!error.hidden) error.textContent = getMessage(field);
    }
    return isValid;
  };

  form.querySelectorAll("[required]").forEach((field) => {
    field.addEventListener("input", () => validateField(field));
    field.addEventListener("change", () => validateField(field));
    field.addEventListener("blur", () => validateField(field, true));
  });

  form.addEventListener("submit", (event) => {
    const invalidField = [...form.querySelectorAll("[required]")]
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
    const isHidden = form.hidden;
    form.hidden = !isHidden;
    button.setAttribute("aria-expanded", String(isHidden));
    button.textContent = isHidden ? "Cancel" : "Edit";
  });
});
