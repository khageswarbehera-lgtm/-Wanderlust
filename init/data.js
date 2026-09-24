const sampleListings = [
  // ================= INDIA =================

  {
    title: "Beautiful Beach House",
    description: "A beautiful house near the beach with a great ocean view.",
    price: 2500,
    image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
    location: "Goa",
    country: "India"
  },

  {
    title: "Mountain View Cottage",
    description: "Peaceful cottage surrounded by mountains and nature.",
    price: 1800,
    image: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b",
    location: "Manali",
    country: "India"
  },

  {
    title: "Modern City Apartment",
    description: "Modern apartment located in the heart of the city.",
    price: 3200,
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688",
    location: "Mumbai",
    country: "India"
  },

  {
    title: "Luxury Villa",
    description: "Spacious luxury villa with swimming pool and garden.",
    price: 5000,
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811",
    location: "Bangalore",
    country: "India"
  },

  {
    title: "Seaside Paradise",
    description: "A peaceful home with beautiful views of the sea.",
    price: 3500,
    image: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2",
    location: "Puri",
    country: "India"
  },

  {
    title: "Forest Retreat",
    description: "A quiet and relaxing stay surrounded by green forests.",
    price: 2800,
    image: "https://images.unsplash.com/photo-1448375240586-882707db888b",
    location: "Wayanad",
    country: "India"
  },

  {
    title: "Luxury Beach Villa",
    description: "A luxurious villa with a private pool near the beach.",
    price: 6500,
    image: "https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf",
    location: "Goa",
    country: "India"
  },

  {
    title: "Hilltop House",
    description: "Beautiful house located on a peaceful hill with amazing views.",
    price: 3000,
    image: "https://images.unsplash.com/photo-1510798831971-661eb04b3739",
    location: "Darjeeling",
    country: "India"
  },

  {
    title: "Riverside Cottage",
    description: "A cozy cottage located beside a beautiful river.",
    price: 2400,
    image: "https://images.unsplash.com/photo-1500534623283-312aade485b7",
    location: "Rishikesh",
    country: "India"
  },

  {
    title: "Modern Luxury Apartment",
    description: "A fully furnished modern apartment in the city center.",
    price: 4200,
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c",
    location: "Delhi",
    country: "India"
  },

  {
    title: "Peaceful Farmhouse",
    description: "A spacious farmhouse surrounded by fields and trees.",
    price: 2700,
    image: "https://images.unsplash.com/photo-1500076656116-558758c991c1",
    location: "Pune",
    country: "India"
  },

  {
    title: "Heritage Haveli",
    description: "Traditional Indian haveli with beautiful architecture and rooms.",
    price: 4500,
    image: "https://images.unsplash.com/photo-1599661046289-e31897846e41",
    location: "Jaipur",
    country: "India"
  },

  {
    title: "Lake View Resort",
    description: "Beautiful resort overlooking a peaceful lake.",
    price: 5200,
    image: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21",
    location: "Udaipur",
    country: "India"
  },

  {
    title: "Small City Studio",
    description: "Affordable and comfortable studio apartment for travelers.",
    price: 1500,
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267",
    location: "Bhubaneswar",
    country: "India"
  },

  {
    title: "Desert Camp",
    description: "Unique desert accommodation with beautiful sunset views.",
    price: 3200,
    image: "https://images.unsplash.com/photo-1473580044384-7ba9967e16a0",
    location: "Jaisalmer",
    country: "India"
  },

  {
    title: "Island Cottage",
    description: "A beautiful private cottage surrounded by clear blue water.",
    price: 5500,
    image: "https://images.unsplash.com/photo-1493552152660-f915ab47ae9d",
    location: "Andaman",
    country: "India"
  },

  {
    title: "Countryside Home",
    description: "A peaceful home in the countryside away from city noise.",
    price: 2100,
    image: "https://images.unsplash.com/photo-1505843513577-22bb7d21e455",
    location: "Ooty",
    country: "India"
  },

  {
    title: "Luxury City Hotel",
    description: "Premium accommodation with modern facilities and city views.",
    price: 6000,
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945",
    location: "Hyderabad",
    country: "India"
  },


  // ================= USA =================

  {
    title: "Manhattan Luxury Apartment",
    description: "Modern apartment with stunning city views in the heart of Manhattan.",
    price: 12000,
    image: "https://images.unsplash.com/photo-1522083165195-3424ed129620",
    location: "New York",
    country: "USA"
  },

  {
    title: "California Beach House",
    description: "Beautiful coastal home perfect for a relaxing vacation near the Pacific Ocean.",
    price: 15000,
    image: "https://images.unsplash.com/photo-1494526585095-c41746248156",
    location: "Malibu",
    country: "USA"
  },

  {
    title: "Mountain Cabin",
    description: "A peaceful wooden cabin surrounded by forests and mountains.",
    price: 9000,
    image: "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8",
    location: "Colorado",
    country: "USA"
  },


  // ================= FRANCE =================

  {
    title: "Parisian Apartment",
    description: "Elegant apartment located close to famous attractions and beautiful Paris streets.",
    price: 11000,
    image: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34",
    location: "Paris",
    country: "France"
  },

  {
    title: "French Countryside Villa",
    description: "Beautiful countryside villa surrounded by vineyards and peaceful scenery.",
    price: 8500,
    image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6",
    location: "Provence",
    country: "France"
  },


  // ================= SWITZERLAND =================

  {
    title: "Swiss Alpine Chalet",
    description: "Traditional chalet with breathtaking views of the Swiss Alps.",
    price: 14000,
    image: "https://images.unsplash.com/photo-1520986606214-8b456906c813",
    location: "Zermatt",
    country: "Switzerland"
  },

  {
    title: "Lake Geneva Retreat",
    description: "Peaceful lakeside accommodation with beautiful mountain views.",
    price: 10000,
    image: "https://images.unsplash.com/photo-1533105079780-92b9be482077",
    location: "Geneva",
    country: "Switzerland"
  },


  // ================= JAPAN =================

  {
    title: "Traditional Japanese House",
    description: "Experience Japanese culture in a peaceful traditional wooden house.",
    price: 7500,
    image: "https://images.unsplash.com/photo-1528360983277-13d401cdc186",
    location: "Kyoto",
    country: "Japan"
  },

  {
    title: "Tokyo City Apartment",
    description: "Modern apartment surrounded by restaurants, shopping and city attractions.",
    price: 9500,
    image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf",
    location: "Tokyo",
    country: "Japan"
  },


  // ================= ITALY =================

  {
    title: "Venice Canal House",
    description: "Charming accommodation overlooking the beautiful canals of Venice.",
    price: 10500,
    image: "https://images.unsplash.com/photo-1520175480921-4edfa2983e0f",
    location: "Venice",
    country: "Italy"
  },

  {
    title: "Tuscan Countryside Villa",
    description: "Beautiful Italian villa surrounded by vineyards and rolling green hills.",
    price: 9000,
    image: "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca",
    location: "Tuscany",
    country: "Italy"
  },


  // ================= UAE =================

  {
    title: "Dubai Luxury Apartment",
    description: "Luxury apartment with modern interiors and spectacular city views.",
    price: 13000,
    image: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c",
    location: "Dubai",
    country: "UAE"
  },

  {
    title: "Desert Luxury Resort",
    description: "Premium desert resort offering a peaceful escape surrounded by golden dunes.",
    price: 16000,
    image: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
    location: "Dubai",
    country: "UAE"
  },


  // ================= AUSTRALIA =================

  {
    title: "Sydney Harbour Apartment",
    description: "Modern apartment with beautiful views of Sydney Harbour and the city.",
    price: 11500,
    image: "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d5",
    location: "Sydney",
    country: "Australia"
  },

  {
    title: "Australian Coastal Villa",
    description: "Relaxing coastal villa surrounded by beautiful beaches and nature.",
    price: 8500,
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
    location: "Gold Coast",
    country: "Australia"
  },


  // ================= GREECE =================

  {
    title: "Santorini Cliff House",
    description: "Beautiful whitewashed house overlooking the blue Aegean Sea.",
    price: 12500,
    image: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff",
    location: "Santorini",
    country: "Greece"
  },


  // ================= INDONESIA =================

  {
    title: "Bali Jungle Villa",
    description: "Peaceful private villa surrounded by tropical forests and greenery.",
    price: 7000,
    image: "https://images.unsplash.com/photo-1539367628448-4bc5c9d171c8",
    location: "Ubud",
    country: "Indonesia"
  },


  // ================= THAILAND =================

  {
    title: "Tropical Beach Resort",
    description: "Beautiful tropical resort with palm trees, beaches and clear blue water.",
    price: 6500,
    image: "https://images.unsplash.com/photo-1505881502353-a1986add3762",
    location: "Phuket",
    country: "Thailand"
  }
];

module.exports = { data: sampleListings };