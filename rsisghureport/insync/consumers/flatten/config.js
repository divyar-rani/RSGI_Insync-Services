const conf = {
    policydata: {
		name: "policydata",
		schema: {
			'MPOS_HEADER': { /* table name */
			products: ['gpa'],
			uniques:['policy_id'],
			array_obj: '',
			repush: false,
			fields: [  
                    { name: 'policy_id',type: 'VARCHAR2', size: 32, primary: true, null: 'NO',mandatory: true },
                    { name: 'POLICYNO',type: 'VARCHAR2', size: 15, primary: true, null: 'NO',default: '',jpath: "d_policy_no"  },
                    { name: 'RENEWALCOUNT',type: 'NUMBER', size: 2,null: 'NO',default: '',jpath: "d_renewalcount"  },
                ]
            },

			'MPOS_DRIVER': { /* table name */
			products: ['gpa'], 
			uniques:['POLICYNO','SERIALNO'],
			array_obj: 'quote.data.named_driver',
			repush: false,
			fields: [
					{ name: 'POLICYNO',   type: 'VARCHAR2', primary: true, size: 15, null: 'NO', default: '', jpath: "d_policy_no"},
					{ name: 'SERIALNO',   type: 'Number', primary: true, size: 4, null: 'NO', default: '', jpath: "d_serialno"},
					{ name: 'NRIC',   type: 'VARCHAR2', size: 15, null: 'NO', default: '', jpath: "d_pnd_nric_fin"},
					{ name: 'DRIVERNAME',   type: 'varchar2', size: 50, null: 'NO', default: '', jpath: "d_pnd_name"},
					{ name: 'DRIVERAGE',   type: 'Number', size: 2, null: 'NO', default: '', jpath: "d_driverage"},
					{ name: 'DRIVINGEXEPERIENCE',   type: 'Number', size: 2, null: 'NO', default: '', jpath: "d_prop_dr_exp"},
					{ name: 'DATEOFLICENCE',   type: 'date', size: 32, null: 'NO', default: '', jpath: "d_dateoflicence"},
					{ name: 'DATEOFBIRTH',   type: 'date', size: 32, null: 'NO', default: '', jpath: "d_pnd_dob"},
				]
            },
        }
    }
}

module.exports = conf;