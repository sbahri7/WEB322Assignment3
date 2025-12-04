const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(process.env.PG_URI, {
  dialect: "postgres",
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false
});

module.exports = sequelize;
