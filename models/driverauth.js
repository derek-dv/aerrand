'use strict'

const Model = use('Model')
const Hash = use('Hash')

class Driver extends Model {
  static get hidden () {
    return ['password']
  }

  static boot () {
    super.boot()
    this.addHook('beforeSave', async (driverInstance) => {
      if (driverInstance.dirty.password) {
        driverInstance.password = await Hash.make(driverInstance.password)
      }
    })
  }

  tokens () {
    return this.hasMany('App/Models/Token')
  }
}

module.exports = Driver
