const Listing = require("../models/listing");

const requiredFields = ["title", "description", "price", "image", "location", "country"];
const fieldLabels = {
  title: "Title",
  description: "Description",
  price: "Price",
  image: "Image URL",
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

  res.render("listings/new", { listing: {}, errors: {} });

};


// ================= CREATE =================

// POST /listings

module.exports.create = async (req, res) => {
  const listing = req.body;
  const missingFields = findMissingFields(listing);

  if (missingFields.length > 0) {
    return res.status(400).render("listings/new", {
      listing,
      errors: getRequiredFieldErrors(missingFields)
    });
  }

  const newListing = new Listing({
    ...listing,
    owner: req.session.userId
  });

  try {
    await newListing.save();
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).render("listings/new", {
        listing,
        errors: getValidationErrors(error)
      });
    }

    throw error;
  }

  res.redirect("/listings");

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

  res.render(
    "listings/show",
    { listing }
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
  const formListing = { ...listingData, _id: id };
  const missingFields = findMissingFields(listingData);

  await getOwnedListingOrThrow(id, req.session.userId);

  if (!listingData.image) {
    const existingListing = await getOwnedListingOrThrow(id, req.session.userId);
    listingData.image = existingListing.image;
  }

  if (missingFields.length > 0) {
    return res.status(400).render("listings/edit", {
      listing: formListing,
      errors: getRequiredFieldErrors(missingFields)
    });
  }

  let listing;

  try {
    listing = await Listing.findOneAndUpdate(
      { _id: id, owner: req.session.userId },
      listingData,
      {
        new: true,
        runValidators: true
      }
    );
  } catch (error) {
    if (error.name === "ValidationError" || error.name === "CastError") {
      const validationErrors = error.name === "CastError"
        ? { price: "Please enter a valid price." }
        : getValidationErrors(error);

      return res.status(400).render("listings/edit", {
        listing: formListing,
        errors: validationErrors
      });
    }

    throw error;
  }

  if (!listing) {
    const error = new Error("Listing not found");
    error.status = 404;
    throw error;
  }

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

  res.redirect("/listings");

};
