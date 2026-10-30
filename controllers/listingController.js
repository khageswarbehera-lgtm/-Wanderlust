const Listing = require("../models/listing");
const imageStorage = require("../services/imageStorage");

const removeListingImage = async (image) => {
  try {
    await imageStorage.remove(image);
  } catch (error) {
    console.error("Could not remove listing image:", error);
  }
};

const requiredFields = ["title", "description", "price", "image", "location", "country"];
const fieldLabels = {
  title: "Title",
  description: "Description",
  price: "Price",
  image: "Listing image",
  location: "Location",
  country: "Country"
};

const findMissingFields = (listing) =>
  requiredFields.filter((field) => {
    const value = listing[field];
    return value === undefined || value === null || String(value).trim() === "";
  });

const getRequiredFieldErrors = (fields) =>
  Object.fromEntries(
    fields.map((field) => [field, `${fieldLabels[field]} is required.`])
  );

const getValidationErrors = (error) =>
  Object.fromEntries(
    Object.entries(error.errors).map(([field, validationError]) => [
      field,
      validationError.message
    ])
  );

const getListingOrThrow = async (id) => {

  const listing = await Listing.findById(id);

  if (!listing) {
    const error = new Error("Listing not found");
    error.status = 404;
    throw error;
  }

  return listing;

};

const getOwnedListingOrThrow = async (id, userId) => {
  const listing = await Listing.findOne({ _id: id, owner: userId });

  if (!listing) {
    const error = new Error("You are not authorized to change this listing");
    error.status = 403;
    throw error;
  }

  return listing;
};


// ================= INDEX =================

// GET /listings

module.exports.index = async (req, res) => {

  const listings = await Listing.find(); 

  res.render(
    "listings/index",
    { listings }
  );

};


// ================= NEW =================

 // GET /listings/new

module.exports.newForm = (req, res) => {

  res.render("listings/new", {
    listing: {},
    errors: {},
    uploadMessage: "No image selected yet."
  });

};


// ================= CREATE =================

// POST /listings

module.exports.create = async (req, res) => {
  const listing = req.body;
  const missingFields = findMissingFields(listing).filter(
    (field) => field !== "image" || !req.file
  );

  if (missingFields.length > 0 || req.uploadError) {
    const errors = getRequiredFieldErrors(missingFields);
    if (req.uploadError) errors.image = req.uploadError;

    return res.status(400).render("listings/new", {
      listing,
      errors,
      uploadMessage: req.uploadError || (req.file
        ? "Image uploaded. Correct the other fields and select it again before resubmitting."
        : "No image was uploaded.")
    });
  }

  const newListing = new Listing({
    ...listing,
    owner: req.session.userId
  });
  let uploadedImage;

  try {
    if (req.file) {
      uploadedImage = await imageStorage.store(req.file);
      newListing.image = uploadedImage;
    }
    await newListing.save();
  } catch (error) {
    if (uploadedImage) await removeListingImage(uploadedImage);
    if (error.name === "ValidationError") {
      return res.status(400).render("listings/new", {
        listing,
        errors: getValidationErrors(error),
        uploadMessage: req.file
          ? "Image uploaded. Correct the other fields and select it again before resubmitting."
          : "No image was uploaded."
      });
    }

    throw error;
  }

  req.session.imageUploadSuccess = true;
  res.redirect(`/listings/${newListing._id}`);

};


// ================= SHOW =================

// GET /listings/:id

module.exports.show = async (req, res) => {

  const { id } = req.params;

  const listing = await Listing.findById(id).populate("reviews");

  if (!listing) {
    const error = new Error("Listing not found");
    error.status = 404;
    throw error;
  }

  const imageUploadSuccess = Boolean(req.session.imageUploadSuccess);
  delete req.session.imageUploadSuccess;

  res.render(
    "listings/show",
    { listing, imageUploadSuccess }
  );

};


// ================= EDIT =================

// GET /listings/:id/edit

module.exports.editForm = async (req, res) => {

  const { id } = req.params;

  const listing = await getOwnedListingOrThrow(id, req.session.userId);

  res.render(
    "listings/edit",
    { listing, errors: {} }
  );

};


// ================= UPDATE =================

// PUT /listings/:id

module.exports.update = async (req, res) => {

  const { id } = req.params;
  const listingData = req.body;
  const existingListing = await getOwnedListingOrThrow(id, req.session.userId);
  if (!listingData.image) listingData.image = existingListing.image;
  const formListing = { ...listingData, _id: id, image: existingListing.image };

  if (req.uploadError) {
    return res.status(400).render("listings/edit", {
      listing: formListing,
      errors: { image: req.uploadError }
    });
  }

  const missingFields = findMissingFields(listingData);
  if (missingFields.length > 0) {
    return res.status(400).render("listings/edit", {
      listing: formListing,
      errors: getRequiredFieldErrors(missingFields)
    });
  }

  let uploadedImage;
  let listing;
  try {
    if (req.file) {
      uploadedImage = await imageStorage.store(req.file);
      listingData.image = uploadedImage;
    }
    listing = await Listing.findOneAndUpdate(
      { _id: id, owner: req.session.userId },
      listingData,
      {
        returnDocument: "after",
        runValidators: true
      }
    );
  } catch (error) {
    if (uploadedImage) await removeListingImage(uploadedImage);
    if (error.name === "ValidationError" || error.name === "CastError") {
      const validationErrors = error.name === "CastError"
        ? { price: "Please enter a valid price." }
        : getValidationErrors(error);

      return res.status(400).render("listings/edit", {
        listing: { ...formListing, ...listingData, image: existingListing.image },
        errors: validationErrors
      });
    }

    throw error;
  }

  if (!listing) {
    if (uploadedImage) await removeListingImage(uploadedImage);
    const error = new Error("Listing not found");
    error.status = 404;
    throw error;
  }

  if (uploadedImage) await removeListingImage(existingListing.image);

  res.redirect(`/listings/${id}`);

};


// ================= DELETE =================

// DELETE /listings/:id

module.exports.destroy = async (req, res) => {

  const { id } = req.params;

  const listing = await Listing.findOneAndDelete({
    _id: id,
    owner: req.session.userId
  });

  if (!listing) {
    const error = new Error("You are not authorized to delete this listing");
    error.status = 403;
    throw error;
  }

  await removeListingImage(listing.image);
  res.redirect("/listings");

};
