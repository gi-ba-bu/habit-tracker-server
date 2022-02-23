const db = require('../dbConfig/init');
const SQL = require('sql-template-strings');

class Habit {

    constructor(data){
        this.habit_id = data.habit_id
        this.habitDescription = data.habitDescription
        this.frequency = data.frequency
        this.currentFrequency = data.currentFrequency
        this.currentTime = data.currentTime
        this.streak = 0
    }

    // Get all habits
    static get all(){
        return new Promise(async (res, rej) => {
            try {
                let result = await db.query(SQL`SELECT * FROM habit`);

                let habits = await  result.rows.map(r => new Habit({habit_id: r.habit_id, habitDescription: r.habitdescription, frequency: r.frequency, currentFrequency: r.currentfrequency, currentTime: r.currenttime, currentStreak: r.currentstreak, maxStreak: r.maxstreak  }))

                res(habits)

            } catch (err) {
                rej(`There was an error retrieving those habits: ${err}`)
            }
        })
    }

    // Create a new habit
    static createHabit({habit, frequency, username}) {
        return new Promise (async (res, rej) => {
            try {
                const getUser = await db.query("SELECT user_id FROM users WHERE username = $1", [username])

                
                const createdHabit = await db.query(SQL`INSERT INTO habit (habitDescription,  frequency, user_id) VALUES (${habit}, ${frequency}, ${getUser.rows[0].user_id}) RETURNING *;`)

                let newHabit = new Habit(createdHabit.rows[0]);

                res(newHabit)
        
            } catch (err) {
                rej(`Could not create that habit: ${err}`)
            }
        })
    }

    // Delete a habit
    static deleteHabit(id) {
        return new Promise(async (res, rej) => {
            try {
                await db.query(SQL`DELETE FROM habit WHERE habit_id = ${id};`)

                res('Habit deleted')

            } catch (err) {
                rej(`There was an error deleting that habit: ${err}`)
            }
        })
    }

    // Get habits by username
    static getHabitsByEmail(email) {
        return new Promise(async (res, rej) => {
            try {
                const allHabits = await db.query(SQL`SELECT * FROM habit INNER JOIN users ON (habit.user_id = users.user_id) AND (users.email = ${email}) ORDER BY habit_id DESC;`);

                let habits = allHabits.rows.map(r => new Habit({habit_id: r.habit_id, habitDescription: r.habitdescription, frequency: r.frequency, currentFrequency: r.currentfrequency, currentTime: r.currenttime, currentStreak: r.currentstreak, maxStreak: r.maxstreak  }))

                res(habits)

            } catch (err) {
                rej(`There was an error getting these habits: ${err}`)
            }
        })
    }

    // Gets habits and updates streaks
    static getHabitsPlusStreaks (username) {

        return new Promise(async (res, rej) => {

            try {
                const user_id = await db.query(SQL`SELECT user_id FROM users WHERE username = ${username};`)

                // all rows in habit table for a specific user in decending order
                const userHabitIds = await db.query(SQL`SELECT habit_id FROM habit WHERE user_id = ${user_id.rows[0].user_id} ORDER BY habit_id DESC;`);

                for(let habitId of userHabitIds.rows) {

                    // rows in habitCount where the habit ids are the same and the dates are the same
                    // completion.rows[0].count to get the count
                    const completion = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE habit_id = ${habitId.habit_id} AND timeDone::DATE = current_date;`);
                   
                    // get the rows (and count of the rows) in habitCount that have the same habit id
                    const habits = await db.query(`SELECT timeDone::DATE,COUNT(timeDone::DATE) FROM habitCount WHERE habit_id = ${habitId.habit_id} GROUP BY timeDone::DATE ORDER BY timeDone::DATE DESC;`)

                    // get the users desired frequency from habit table
                    const freq = await db.query(SQL`SELECT frequency FROM habit WHERE habit_id = ${habitId.habit_id};`)

                    // get the users current streak from habit table
                    const currentStreak = await db.query(SQL`SELECT currentStreak FROM habit WHERE habit_id = ${habitId.habit_id};`)

                    // get the users max streak from habit table
                    const maxStreak = await db.query(SQL`SELECT maxstreak FROM habit WHERE habit_id = ${habitId.habit_id};`)

                    // set streak to zero
                    let streak = 0;

                    // for all rows in habitCount that have the same habit id
                    for (let count of habits.rows) {

                        // if the number of rows is equal to the desired frequency
                        if (count.count == freq.rows[0].frequency) {
                            
                            // increment streak
                            streak++;

                            // update cureentStreak to streak
                            await db.query(SQL`UPDATE habit SET currentStreak = ${streak} WHERE habit_id = ${habitId.habit_id};`);

                            // If currentStreak is greater than the maxStreak update that too 
                            if (currentStreak.rows[0].currentStreak >= maxStreak.rows[0].maxstreak) {
                                await db.query(SQL`UPDATE habit SET maxStreak = ${streak} WHERE habit_id = ${habitId.habit_id};`);

                            }

                        } else {
                            break;
                        }
                    }

                    // update the current frequency to the number of rows in habitCount where the habit ids and the dates are the same
                    await db.query(SQL`UPDATE habit SET currentFrequency = ${completion.rows[0].count} WHERE habit_id = ${habitId.habit_id};`);

                }

                // get users habit data
                const getUser = await db.query(SQL`SELECT user_id FROM users WHERE username = ${username};`)

                const habitData = await db.query(SQL`SELECT * FROM habit WHERE user_id = ${parseInt(getUser.rows[0].user_id)} ORDER BY habit_id DESC;`)

                res(habitData)

            } catch (err) {
                rej (`There was an error: ${err}`)
            }
        })
    }

    static newEntry(data) {

        return new Promise(async (res, rej) => {

          try {

            // Insert habits into habitCounter
            await db.query(SQL`INSERT INTO habitCount (habit_id, completedStreak) VALUES (${data.habit_id}, FALSE);`);
            
            // user's inputted desired frequency
            const dFrequency = await db.query(SQL`SELECT frequency FROM habit WHERE habit_id=${data.habit_id};`);

            // number of entries in habitCount with the current date and the same habit id
            const entries = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date AND habit_id= ${data.habit_id};`);

            // Check if its the first entry of the day
            if(entries.rows[0].count == 1){

                // Previous day
                const yesterday = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date - 1 AND habit_id= ${data.habit_id};`);

                // If yesterday did not have the number of entries in habitCount equal to the users inputted desired frequency
                if(yesterday.rows[0].count != dFrequency.rows[0].frequency){ 
                    // Habit was not completed on the previous day so set the current streak to zero
                    await db.query(SQL`UPDATE habit SET currentStreak = 0 WHERE habit_id = ${data.habit_id};`);
                } 
            }
          
            // if number of todays entries in habitCount is equal to the users desired frequency then increase the current streak by 1
            else if(parseInt(entries.rows[0].count) == parseInt(dFrequency.rows[0].frequency)){
             
                await db.query(SQL`UPDATE habit SET currrentStreak = currentStreak + 1 WHERE habit_id = ${data.habit_id};`);
                // need to disable button after this
            }
         
            res('Everything up to date!')

          } catch (err) {
            rej(`${err}`);
          }
        });
      }

      static getGraphData(email) {
        return new Promise(async (res, rej) => {
            try {

                const user_id = await db.query(SQL`SELECT user_id FROM users WHERE email = ${email};`)

                // all rows in habit table for a specific user in decending order
                const userHabitIds = await db.query(SQL`SELECT habit_id FROM habit WHERE user_id = ${user_id.rows[0].user_id} ORDER BY habit_id DESC;`);

                for(let habitId of userHabitIds.rows) {

                    const todayDate = Date(db.query(SQL`SELECT DISTINCT timeDone::DATE FROM habitCount WHERE timeDone::DATE = current_date;`))
    
                    const todayHabitCount = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date AND habit_id = ${habitId.habit_id};`);
    
                    const yesterdayDate = await db.query(SQL`SELECT DISTINCT timeDone::DATE FROM habitCount WHERE timeDone::DATE = current_date - 1;`)
    
                    const yesterdayHabitCount = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date - 1 AND habit_id = ${habitId.habit_id};`);
    
                    const dayBeforeYdayDate = await db.query(SQL`SELECT DISTINCT timeDone::DATE FROM habitCount WHERE timeDone::DATE = current_date - 2;`)
    
                    const dayBeforeYdaydHabitCount = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date - 2 AND habit_id = ${habitId.habit_id};`);
    
                    const threeDaysBeforeDate = await db.query(SQL`SELECT DISTINCT timeDone::DATE FROM habitCount WHERE timeDone::DATE = current_date - 3;`)
    
                    const threeDaysBeforeHabitCount = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date - 3 AND habit_id = ${habitId.habit_id};`);
    
                    const fourDaysBeforeDate = await db.query(SQL`SELECT DISTINCT timeDone::DATE FROM habitCount WHERE timeDone::DATE = current_date - 4;`)
    
                    const fourDaysBeforeHabitCount = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date - 4 AND habit_id = ${habitId.habit_id};`);
    
                    const fiveDaysBeforeDate = await db.query(SQL`SELECT DISTINCT timeDone::DATE FROM habitCount WHERE timeDone::DATE = current_date - 5;`)
    
                    const fiveDaysBeforeHabitCount = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date - 5 AND habit_id = ${habitId.habit_id};`);
    
                    const sixDaysBeforeDate = await db.query(SQL`SELECT DISTINCT timeDone::DATE FROM habitCount WHERE timeDone::DATE = current_date - 6;`)
    
                    const sixDaysBeforeHabitCount = await db.query(SQL`SELECT COUNT(*) FROM habitCount WHERE timeDone::DATE = current_date - 6 AND habit_id = ${habitId.habit_id};`);

                    res([todayDate, todayHabitCount])
                }

            } catch (err) {
                rej(`There was an error retrieving that graph data: ${err}`)
            }
        })
    }
}

module.exports = { Habit }
