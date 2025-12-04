const { Sequelize } = require("sequelize");
const pg = require("pg");   // ensure this line exists

const sequelize = new Sequelize(process.env.PG_URI, {
  dialect: "postgres",
  dialectModule: pg,        // ensure this line exists
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false
});

module.exports = sequelize;
