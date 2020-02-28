// https://stackoverflow.com/questions/19317258/how-to-use-dijit-textarea-validation-dojo-1-9

define(["dojo/_base/declare", "dojo/_base/lang", "dijit/form/SimpleTextarea", "dijit/form/ValidationTextBox"],
    function(declare, lang, SimpleTextarea, ValidationTextBox) {

        return declare('fox.form.ValidationTextArea', [SimpleTextarea, ValidationTextBox], {
            constructor: function(params){
                this.constraints = {};
                this.baseClass += ' dijitValidationTextArea';
            },
            templateString: "<textarea ${!nameAttrSetting} data-dojo-attach-point='focusNode,containerNode,textbox' autocomplete='off'></textarea>",
            validator: function(value, constraints) {
                //console.log(this, value, constraints);

                if (this.required && this._isEmpty(value))
                    return false;

                if (this.validregexp) {
                    try {
                        new RegExp("/" + value + "/");
                    } catch (e) {
                        return false;
                    }
                }

                return value.match(new RegExp(this._computeRegexp(constraints)));

                /*return (new RegExp("^(?:" + this._computeRegexp(constraints) + ")"+(this.required?"":"?")+"$",["m"])).test(value) &&
                    (!this.required || !this._isEmpty(value)) &&
                    (this._isEmpty(value) || this.parse(value, constraints) !== undefined); // Boolean*/
            }
        })
    });
